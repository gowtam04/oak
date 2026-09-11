import Foundation

@testable import OakApp

/// In-memory ``TeamService`` test double (testing-strategy.md "Mocking policy": service
/// protocols are faked for view-model unit tests). Stateful — it keeps a small team store
/// so CRUD, apply-proposed, and the Showdown export→import round-trip all behave
/// realistically — plus per-call error injection and call recording so tests can assert
/// the request shape.
///
/// Round-trip fidelity (M-BR-T5): ``exportPaste(id:)`` serializes the team's members to a
/// JSON "paste" and ``importPaste(format:paste:)`` parses it back, so a team exported then
/// imported reproduces its members exactly — the client-layer round-trip the real backend
/// guarantees through Showdown text.
///
/// `@unchecked Sendable`: the store/recording state is mutable, but every test drives it
/// serially from the main actor and `await`s each call, so there is no concurrent access.
final class FakeTeamService: TeamService, @unchecked Sendable {
  // MARK: Store

  private(set) var store: [Team]
  private var nextId = 1

  /// Validation warnings returned by the next create/update/get/duplicate (warn-but-allow).
  var nextWarnings: [TeamWarning] = []
  /// Import notes returned by the next ``importPaste(format:paste:)``.
  var nextNotes: [ImportNote] = []

  // MARK: Error injection

  var listError: OakError?
  var getError: OakError?
  var createError: OakError?
  var updateError: OakError?
  var deleteError: OakError?
  var duplicateError: OakError?
  var importError: OakError?
  var exportError: OakError?
  var analyzeError: OakError?

  // MARK: Analyze (public draft-coverage endpoint)

  /// The result the next ``analyze(format:members:)`` returns (unless ``analyzeHandler`` is set).
  var analyzeResult: TeamAnalysis = .unavailable(format: .scarletViolet)
  /// Computes the result FROM the request, so overlapping gated calls get request-specific results
  /// regardless of the (non-deterministic) order their continuations resume in — the reliable way
  /// to test the stale-result guard. Takes precedence over ``analyzeResult`` when set.
  var analyzeHandler: (@Sendable (Format, [TeamMember]) -> TeamAnalysis)?
  /// When `true`, every analyze call parks until ``releaseAnalyze()`` — so a test can control the
  /// completion ordering of overlapping requests (the stale-result guard).
  var holdsAnalyze = false
  private var parkedAnalyze: [CheckedContinuation<Void, Never>] = []

  /// When `true`, every create parks until ``releaseCreate()`` — used to prove autosave
  /// never issues a second create while the first is in flight.
  var holdsCreate = false
  private var parkedCreate: [CheckedContinuation<Void, Never>] = []

  // MARK: Recording

  private(set) var listCount = 0
  private(set) var lastListFormat: Format?

  private(set) var getCount = 0
  private(set) var lastGetId: String?

  private(set) var createCount = 0
  private(set) var lastCreateFormat: Format?
  private(set) var lastCreateName: String?
  private(set) var lastCreateMembers: [TeamMember]?

  private(set) var updateCount = 0
  private(set) var lastUpdateId: String?
  private(set) var lastUpdateName: String?
  private(set) var lastUpdateMembers: [TeamMember]?

  private(set) var deleteCount = 0
  private(set) var lastDeletedId: String?

  private(set) var duplicateCount = 0
  private(set) var lastDuplicatedId: String?

  private(set) var importCount = 0
  private(set) var lastImportFormat: Format?
  private(set) var lastImportPaste: String?

  private(set) var exportCount = 0
  private(set) var lastExportId: String?

  private(set) var analyzeCalls = 0
  private(set) var lastAnalyzeFormat: Format?
  private(set) var lastAnalyzeMembers: [TeamMember]?

  /// Champions-first living vs archive (GET `/api/teams` vs `?archived=1`).
  private(set) var lastListArchived: Bool?

  init(seed: [Team] = []) {
    self.store = seed
  }

  // MARK: Helpers

  private func mintId() -> String {
    defer { nextId += 1 }
    return "team-\(nextId)"
  }

  private static let stamp: Int64 = 1_000

  private func notFound() -> OakError {
    .http(status: 404, code: "not_found", message: "Team not found.")
  }

  // MARK: TeamService

  func list(format: Format?) async throws -> [TeamSummary] {
    listCount += 1
    lastListFormat = format
    if let listError { throw listError }
    return
      store
      .filter { format == nil || $0.format == format }
      .map(TeamSummary.init(team:))
  }

  /// Living Champions teams (`GET /api/teams`). P7 `TeamService.list(archived:)`
  /// should call through here with `archived: false`.
  func list(archived: Bool) async throws -> [TeamSummary] {
    listCount += 1
    lastListArchived = archived
    lastListFormat = nil
    if let listError { throw listError }
    return
      store
      .filter { archived ? $0.format != .champions : $0.format == .champions }
      .map(TeamSummary.init(team:))
  }

  func get(id: String) async throws -> (team: Team, validation: TeamValidationResult) {
    getCount += 1
    lastGetId = id
    if let getError { throw getError }
    guard let team = store.first(where: { $0.id == id }) else { throw notFound() }
    return (team, TeamValidationResult(warnings: nextWarnings))
  }

  func create(
    format: Format,
    name: String?,
    members: [TeamMember]?
  ) async throws -> (team: Team, validation: TeamValidationResult) {
    createCount += 1
    lastCreateFormat = format
    lastCreateName = name
    lastCreateMembers = members
    if holdsCreate {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        parkedCreate.append(continuation)
      }
    }
    if let createError { throw createError }
    let team = Team(
      id: mintId(),
      name: name ?? "Untitled team",
      format: format,
      members: members ?? [],
      createdAt: Self.stamp,
      updatedAt: Self.stamp
    )
    store.insert(team, at: 0)
    return (team, TeamValidationResult(warnings: nextWarnings))
  }

  func update(
    id: String,
    name: String?,
    members: [TeamMember]?
  ) async throws -> (team: Team, validation: TeamValidationResult) {
    updateCount += 1
    lastUpdateId = id
    lastUpdateName = name
    lastUpdateMembers = members
    if let updateError { throw updateError }
    guard let index = store.firstIndex(where: { $0.id == id }) else { throw notFound() }
    let existing = store[index]
    let updated = Team(
      id: existing.id,
      name: name ?? existing.name,
      format: existing.format,
      members: members ?? existing.members,
      createdAt: existing.createdAt,
      updatedAt: Self.stamp
    )
    store[index] = updated
    return (updated, TeamValidationResult(warnings: nextWarnings))
  }

  func delete(id: String) async throws {
    deleteCount += 1
    lastDeletedId = id
    if let deleteError { throw deleteError }
    store.removeAll { $0.id == id }
  }

  func duplicate(id: String) async throws -> (team: Team, validation: TeamValidationResult) {
    duplicateCount += 1
    lastDuplicatedId = id
    if let duplicateError { throw duplicateError }
    guard let source = store.first(where: { $0.id == id }) else { throw notFound() }
    let copy = Team(
      id: mintId(),
      name: "\(source.name) copy",
      format: source.format,
      members: source.members,
      createdAt: Self.stamp,
      updatedAt: Self.stamp
    )
    store.insert(copy, at: 0)
    return (copy, TeamValidationResult(warnings: nextWarnings))
  }

  func importPaste(
    format: Format,
    paste: String
  ) async throws -> (team: Team, validation: TeamValidationResult, notes: [ImportNote]) {
    importCount += 1
    lastImportFormat = format
    lastImportPaste = paste
    if let importError { throw importError }
    let members = (try? Self.decodeMembers(paste)) ?? []
    let team = Team(
      id: mintId(),
      name: "Imported team",
      format: format,
      members: members,
      createdAt: Self.stamp,
      updatedAt: Self.stamp
    )
    store.insert(team, at: 0)
    return (team, TeamValidationResult(warnings: nextWarnings), nextNotes)
  }

  func exportPaste(id: String) async throws -> String {
    exportCount += 1
    lastExportId = id
    if let exportError { throw exportError }
    guard let team = store.first(where: { $0.id == id }) else { throw notFound() }
    return Self.encodeMembers(team.members)
  }

  func analyze(format: Format, members: [TeamMember]) async throws -> TeamAnalysis {
    analyzeCalls += 1
    lastAnalyzeFormat = format
    lastAnalyzeMembers = members
    if holdsAnalyze {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        parkedAnalyze.append(continuation)
      }
    }
    if let analyzeError { throw analyzeError }
    if let analyzeHandler { return analyzeHandler(format, members) }
    return analyzeResult
  }

  /// How many analyze calls are currently parked on the ``holdsAnalyze`` gate.
  var pendingAnalyzeCount: Int { parkedAnalyze.count }

  /// Resumes every parked analyze call (they then return their queued/default result).
  func releaseAnalyze() {
    let continuations = parkedAnalyze
    parkedAnalyze = []
    for continuation in continuations { continuation.resume() }
  }

  /// How many create calls are currently parked on the ``holdsCreate`` gate.
  var pendingCreateCount: Int { parkedCreate.count }

  /// Resumes every parked create call.
  func releaseCreate() {
    let continuations = parkedCreate
    parkedCreate = []
    for continuation in continuations { continuation.resume() }
  }

  // MARK: Round-trip (members ⇄ JSON "paste")

  static func encodeMembers(_ members: [TeamMember]) -> String {
    let data = (try? JSONEncoder().encode(members)) ?? Data()
    return String(decoding: data, as: UTF8.self)
  }

  static func decodeMembers(_ paste: String) throws -> [TeamMember] {
    try JSONDecoder().decode([TeamMember].self, from: Data(paste.utf8))
  }
}
