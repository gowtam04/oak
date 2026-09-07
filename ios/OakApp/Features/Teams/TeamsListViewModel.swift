import Foundation
import Observation

/// The team-library view model (history-and-teams.md M-TEAM-US-6; component-design.md
/// "TeamsListViewModel"). Holds the team list and the format-filter state, drives the
/// library mutations (create / duplicate / delete), and folds in agent-applied and
/// imported teams.
///
/// `@MainActor @Observable` — all state mutates on the main actor and views observe it
/// directly. It depends on the ``TeamService`` **protocol** (never the `Live…`
/// concrete) so it unit-tests against `FakeTeamService`.
///
/// Teams are signed-in only (M-BR-T1): a guest gets `401` from the routes, so the view
/// shows a sign-in prompt rather than this list. The format filter (`?format=`) is
/// applied **server-side** — changing it re-fetches via ``reload()``.
@MainActor
@Observable
final class TeamsListViewModel {

  // MARK: List state

  /// The visible living Champions team summaries, most-recently-edited first.
  private(set) var teams: [TeamSummary] = []

  /// Archived other-format teams (`GET /api/teams?archived=1`). View + delete only.
  private(set) var archivedTeams: [TeamSummary] = []

  /// `true` while a list fetch is in flight (drives the refresh spinner).
  private(set) var isLoading: Bool = false

  /// A user-facing error message for the last failed operation, or `nil` when clear.
  private(set) var errorMessage: String?

  /// Batch-resolved sprite refs for the loaded teams' filled slots, keyed by species
  /// slug (flattened across formats — the rows only need each slug's sprite URL). Feeds
  /// the row's mini roster so it shows Pokémon artwork instead of plain dots; an absent
  /// entry (unknown species, or a failed/degraded fetch) simply falls back to a dot. The
  /// hydration is fire-and-forget after each ``reload()`` and never blocks or errors the
  /// list (mirrors ``TeamEditorViewModel/refreshSprites()``'s never-throw policy).
  private(set) var spriteRefsBySpecies: [String: DexSpriteRef] = [:]

  // MARK: Filter state

  /// The active format filter (M-TEAM-US-6); `nil` = all formats. Applied server-side.
  private(set) var formatFilter: Format?

  // MARK: Dependencies

  private let teamService: any TeamService
  private let dexLookup: any DexLookupService

  init(teamService: any TeamService, dexLookup: any DexLookupService = EmptyDexLookupService()) {
    self.teamService = teamService
    self.dexLookup = dexLookup
  }

  // MARK: Loading

  /// (Re)loads the living Champions list. Never throws: a failure surfaces as
  /// ``errorMessage`` and leaves the prior list.
  func reload() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      teams = try await teamService.list(archived: false)
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
    } catch {
      errorMessage = Self.genericMessage
    }
    await hydrateSprites()
  }

  /// Loads archived other-format teams (`GET /api/teams?archived=1`).
  func reloadArchived() async {
    do {
      archivedTeams = try await teamService.list(archived: true)
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
    } catch {
      errorMessage = Self.genericMessage
    }
    await hydrateSprites()
  }

  func canEdit(_ summary: TeamSummary) -> Bool { summary.isLiving }
  func canDuplicate(_ summary: TeamSummary) -> Bool { summary.isLiving }
  func canApplySet(_ summary: TeamSummary) -> Bool { summary.isLiving }
  func canDelete(_ summary: TeamSummary) -> Bool { true }

  /// Batch-resolves sprite refs for every distinct species across the loaded teams so
  /// the rows can render Pokémon artwork instead of dots. Batches one call per distinct
  /// format (teams can span any of the known scopes) and merges the results, keyed by
  /// species slug. `dexLookup.sprites` never throws — a transport/decode fault folds to
  /// an empty map — so a miss just leaves those slots on the dot fallback; this never
  /// blocks or errors the list (M-AC-1.4). Replaces the map wholesale each load so refs
  /// for teams no longer in the list are dropped.
  private func hydrateSprites() async {
    var byFormat: [Format: Set<String>] = [:]
    for team in teams + archivedTeams {
      for species in team.species where !species.isEmpty {
        byFormat[team.format, default: []].insert(species)
      }
    }
    guard !byFormat.isEmpty else {
      spriteRefsBySpecies = [:]
      return
    }
    var merged: [String: DexSpriteRef] = [:]
    for (format, species) in byFormat {
      let refs = await dexLookup.sprites(names: Array(species), format: format)
      merged.merge(refs) { _, new in new }
    }
    spriteRefsBySpecies = merged
  }

  /// The resolved sprite ref for a species slug, or `nil` when unresolved (the row then
  /// shows its dot fallback for that slot).
  func spriteRef(for species: String) -> DexSpriteRef? {
    species.isEmpty ? nil : spriteRefsBySpecies[species]
  }

  /// Leftover trampoline — there is no format picker. Other-game values cannot
  /// reopen a gen-N living list (CF-TEAM-AC-1.7).
  func setFormatFilter(_ format: Format?) async {
    _ = format
    formatFilter = nil
    await reload()
  }

  // MARK: Library mutations

  /// Creates a new, empty team in the given format (M-TEAM-US-1) and inserts its
  /// summary at the top. Returns the created ``Team`` (for handing straight to the
  /// editor), or `nil` on failure. `name == nil` ⇒ the server's default name.
  @discardableResult
  func createTeam(format: Format, name: String? = nil) async -> Team? {
    _ = format
    do {
      let (team, _) = try await teamService.create(format: .champions, name: name, members: nil)
      insertOrReplace(TeamSummary(team: team))
      return team
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      errorMessage = Self.genericMessage
      return nil
    }
  }

  /// Duplicates a team (M-TEAM-US-6) and inserts the copy's summary at the top.
  @discardableResult
  func duplicate(_ summary: TeamSummary) async -> Team? {
    guard canDuplicate(summary) else { return nil }
    do {
      let (team, _) = try await teamService.duplicate(id: summary.id)
      insertOrReplace(TeamSummary(team: team))
      return team
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      errorMessage = Self.genericMessage
      return nil
    }
  }

  /// Deletes a team (M-TEAM-US-6). Optimistically removes the row, then persists. A
  /// `404` is treated as success (already gone — idempotent UX); any other failure
  /// restores the row and surfaces an error.
  func delete(_ summary: TeamSummary) async {
    let snapshot = teams
    let archivedSnapshot = archivedTeams
    teams.removeAll { $0.id == summary.id }
    archivedTeams.removeAll { $0.id == summary.id }
    do {
      try await teamService.delete(id: summary.id)
    } catch OakError.http(let status, _, _) where status == 404 {
      // Already deleted on the server — keep it removed (idempotent).
    } catch let error as OakError {
      teams = snapshot
      archivedTeams = archivedSnapshot
      errorMessage = Self.message(for: error)
    } catch {
      teams = snapshot
      archivedTeams = archivedSnapshot
      errorMessage = Self.genericMessage
    }
  }

  // MARK: Apply proposed (agent-assisted) & import

  /// Applies an agent-proposed team to saved storage as a **new** team
  /// (M-TEAM-US-4 / M-BR-T4 — applying is always an explicit user action), then inserts
  /// its summary at the top. This is the real implementation the AnswerCard's "Apply"
  /// action routes to (`POST /api/teams` with the proposed name/format/members). Returns
  /// the saved ``Team`` or `nil` on failure.
  @discardableResult
  func applyProposed(_ proposed: ProposedTeam) async -> Team? {
    do {
      let (team, _) = try await teamService.create(
        format: .champions,
        name: proposed.name,
        members: proposed.members
      )
      insertOrReplace(TeamSummary(team: team))
      return team
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      errorMessage = Self.genericMessage
      return nil
    }
  }

  /// Imports a Showdown paste into a new saved team (M-TEAM-US-2) and inserts its
  /// summary. Returns the saved team and any resolve-or-clarify ``ImportNote``s (the
  /// import never fails wholesale), or `nil` on a transport/HTTP failure.
  @discardableResult
  func importPaste(_ paste: String, format: Format) async -> (team: Team, notes: [ImportNote])? {
    do {
      _ = format
      let (team, _, notes) = try await teamService.importPaste(format: .champions, paste: paste)
      insertOrReplace(TeamSummary(team: team))
      return (team, notes)
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      errorMessage = Self.genericMessage
      return nil
    }
  }

  /// Clears the current error banner.
  func dismissError() {
    errorMessage = nil
  }

  // MARK: Child editor factories

  /// An editor for a brand-new, unsaved team in `format` (the "+" flow). The editor's
  /// own Save persists it; the list reloads on return.
  func makeEditor(forNewTeam format: Format) -> TeamEditorViewModel {
    _ = format
    return TeamEditorViewModel(teamService: teamService, dexLookup: dexLookup, format: .champions)
  }

  /// An editor for an existing team (by summary); the editor's ``TeamEditorViewModel/load()``
  /// fetches the full members + warnings.
  func makeEditor(for summary: TeamSummary) -> TeamEditorViewModel {
    TeamEditorViewModel(teamService: teamService, dexLookup: dexLookup, summary: summary)
  }

  /// An editor for an already-loaded full team (e.g. a freshly applied/imported team),
  /// with no extra fetch.
  func makeEditor(for team: Team) -> TeamEditorViewModel {
    TeamEditorViewModel(teamService: teamService, dexLookup: dexLookup, team: team)
  }

  // MARK: Local list edits

  /// Inserts a summary at the top, or replaces the existing row with the same id and
  /// moves it to the top (mirrors the server's most-recently-edited-first ordering for
  /// a freshly created/updated team).
  private func insertOrReplace(_ summary: TeamSummary) {
    teams.removeAll { $0.id == summary.id }
    teams.insert(summary, at: 0)
  }

  // MARK: Error copy (static so tests can assert exact strings)

  static let connectionMessage = "No connection. Check your network and try again."
  static let sessionExpiredMessage = "Your session expired. Please sign in again."
  static let genericMessage = "Something went wrong. Please try again."

  /// Maps an ``OakError`` to a user-facing message.
  static func message(for error: OakError) -> String {
    switch error {
    case .transport:
      return connectionMessage
    case .rateLimited:
      return "You're going too fast. Please wait a moment and try again."
    case .unauthorized:
      return sessionExpiredMessage
    case let .http(_, _, message):
      return message.isEmpty ? genericMessage : message
    case .decoding, .imageRejected, .turnInProgress:
      return genericMessage
    }
  }
}

// MARK: - Summary from a full team

extension TeamSummary {
  /// Derives the list-row summary from a full ``Team`` (returned by create / duplicate /
  /// import / apply) so a freshly persisted team can join the list without a re-fetch.
  /// Mirrors the server's `listTeams` projection: filled-slot species, a member count,
  /// and the cheap "incomplete" rule (<6 members, or any slot missing a species / its
  /// 4th move).
  init(team: Team) {
    self.init(
      id: team.id,
      name: team.name,
      format: team.format,
      memberCount: team.members.count,
      incomplete: team.members.count < 6
        || team.members.contains { $0.species == nil || $0.moves.count < 4 },
      species: team.members.compactMap(\.species),
      updatedAt: team.updatedAt
    )
  }
}
