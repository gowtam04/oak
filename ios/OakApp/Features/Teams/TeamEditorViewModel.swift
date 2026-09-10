import Foundation
import Observation

/// The full-set team editor's view model (history-and-teams.md M-TEAM-US-1/3;
/// component-design.md "TeamEditorViewModel"). Holds the editable team (name + up to 6
/// member sets, each with species / ability / item / four moves / nature / EVs / IVs /
/// Tera / level), drives **debounced autosave** (create-or-update), and surfaces the
/// server's **warn-but-allow** validation — warnings are rendered but **never block
/// save** (M-AC-T3.1 / M-BR-T3). There is no Save button: every draft change persists
/// automatically.
///
/// `@MainActor @Observable` — the editable members are plain value-type structs the
/// SwiftUI form binds to two-way (`$model.members[i].evs.hp`, etc.), so steppers /
/// pickers / text fields edit them directly. Depends on the ``TeamService`` **protocol**
/// (never `LiveTeamService`) so it unit-tests against `FakeTeamService`.
///
/// A team's `format` is fixed for its life (M-BR-T2): it is set at creation and never
/// edited here. Slugs (not display names) are stored/sent (the team data model); the
/// server resolves names and flags anything illegal as an advisory warning.
@MainActor
@Observable
final class TeamEditorViewModel {

  // MARK: Identity

  /// The saved team's id once persisted; `nil` for a brand-new, unsaved team.
  private(set) var teamId: String?

  /// The team's fixed data-scope format (M-BR-T2). New editors always Champions;
  /// archived teams keep their stored origin format.
  let format: Format

  /// Archived teams are view + delete only (CF-TEAM-US-5).
  var isReadOnly: Bool { format.isArchived }

  /// Writes are offered only on living Champions teams (archived is view-only).
  var canSave: Bool { !isReadOnly }

  /// Living Champions editor hides Tera / IVs / level (CF-TEAM-AC-1.2, ADR-7).
  var showsTeraField: Bool { false }
  var showsIVKnobs: Bool { false }
  var showsLevelKnob: Bool { false }
  var showsStatPoints: Bool { !isReadOnly }

  let statPointBudget = 66
  let statPointStatCap = 32

  // MARK: Editable state (two-way bound)

  /// The team name (M-AC-T1.1). Trimmed on save; an empty name defaults server-side.
  var name: String

  /// The editable member sets (0…6). Bound field-by-field by the editor form.
  var members: [EditableMember]

  // MARK: Result state

  /// The server's warn-but-allow validation warnings from the last load/save. Rendered,
  /// never blocking (M-AC-T3.1).
  private(set) var warnings: [TeamWarning] = []

  /// The last successfully saved team snapshot (drives "saved" confirmation + export).
  private(set) var savedTeam: Team?

  /// `true` while a save is in flight.
  private(set) var isSaving: Bool = false

  /// Transient "Saved" confirmation flag; the screen self-clears it after ~1s.
  private(set) var showSaveConfirmation: Bool = false

  /// Debounce window before an autosave fires. Internal (not `private`) so unit tests
  /// can collapse it to `.zero`. Production is 600 ms.
  var saveDebounce: Duration = .milliseconds(600)

  /// Last payload successfully persisted (or the draft at load). Autosave no-ops when
  /// the current persistable snapshot equals this, so opening New and backing out
  /// without edits does not create a ghost team.
  private var lastPersisted: PersistableDraft

  /// Debounce timer — cancelled and replaced on every `scheduleSave`. Never cancelled
  /// mid-network: that lives on ``persistTask``.
  private var debounceTask: Task<Void, Never>?

  /// The in-flight persist loop. Concurrent `kickPersist` waiters await this instead of
  /// starting a second create.
  private var persistTask: Task<Void, Never>?

  /// When `true`, the next persist loop writes even if the snapshot matches
  /// ``lastPersisted`` (explicit ``save()`` / failed-retry flush).
  private var forcePersist = false

  /// The last persist attempt failed. Trailing `kickPersist` must not retry-loop on
  /// a hard error; a new edit (`scheduleSave`) or `flushSave`/`save()` clears this.
  private var persistFailed = false

  /// `true` while the initial load (existing team) is in flight.
  private(set) var isLoading: Bool = false

  /// A user-facing error message for the last failed operation, or `nil` when clear.
  private(set) var errorMessage: String?

  // MARK: Team analysis (draft coverage — public, debounced)

  /// The latest whole-team coverage analysis for the current draft, or `nil` before the first
  /// result / when the draft has no filled species. Rendered by the editor's Analysis section
  /// (#9). Never blocks editing — it is a passive, advisory read.
  private(set) var analysis: TeamAnalysis?

  /// `true` while a debounced analysis request is in flight (drives a subtle spinner; the last
  /// good result stays visible underneath).
  private(set) var isAnalyzing: Bool = false

  /// A user-facing message when the last analysis request failed. The previous ``analysis`` (if
  /// any) is intentionally RETAINED so the panel keeps showing the last good coverage while the
  /// error banner offers a Retry.
  private(set) var analysisError: String?

  /// The in-flight debounce/analysis task — cancelled and replaced on every fresh schedule so
  /// rapid edits coalesce into a single request.
  private var analysisTask: Task<Void, Never>?

  /// Bumped on every schedule; a slow in-flight result whose generation no longer matches is
  /// discarded (a stale result must never overwrite a newer one).
  private var analysisGeneration = 0

  /// The debounce window before a scheduled analysis fires. Internal (not `private`) so unit
  /// tests can collapse it to `.zero` for deterministic coalescing — the production value is
  /// 750 ms (matches the web panel's debounce).
  var analysisDebounce: Duration = .milliseconds(750)

  // MARK: Dex-lookup state (transient — never persisted; feeds the entity pickers)

  /// Batch-resolved sprite/type/ability/base-stat refs, keyed by species slug. Refreshed
  /// whenever a member's species changes (``refreshSprites()``); an entry is absent for an
  /// unresolved/unknown species (the picker/header simply shows no sprite).
  private(set) var spriteRefsBySpecies: [String: DexSpriteRef] = [:]

  /// Each member's fetched legal movepool, keyed by the member's stable `id`. The Move
  /// pickers offer ONLY these options (excluded, not merely warned) — an already-set move
  /// outside the movepool (e.g. from an import) still displays via its titleized slug, it
  /// just isn't offered as a fresh selection (mirrors `TeamMemberPanel.tsx`).
  private(set) var movepoolByMemberId: [UUID: [LearnsetMove]] = [:]

  // MARK: Dependencies

  private let teamService: any TeamService
  private let dexLookup: any DexLookupService

  // MARK: Init

  /// Opens the editor on a brand-new, unsaved team in `format`, seeded with one empty
  /// member set so the form has something to fill (M-AC-T1.1).
  init(
    teamService: any TeamService,
    dexLookup: any DexLookupService = EmptyDexLookupService(),
    format: Format,
    name: String = ""
  ) {
    self.teamService = teamService
    self.dexLookup = dexLookup
    self.format = .champions
    self.name = name
    let seeded = [EditableMember()]
    self.members = seeded
    self.lastPersisted = Self.persistable(name: name, members: seeded)
    _ = format
  }

  /// Opens the editor on an existing team by its list summary; ``load()`` fetches the
  /// full members + warnings.
  init(
    teamService: any TeamService,
    dexLookup: any DexLookupService = EmptyDexLookupService(),
    summary: TeamSummary
  ) {
    self.teamService = teamService
    self.dexLookup = dexLookup
    self.teamId = summary.id
    self.format = summary.format
    self.name = summary.name
    self.members = []
    self.lastPersisted = Self.persistable(name: summary.name, members: [])
  }

  /// Opens the editor on an already-loaded full team (e.g. straight after create /
  /// duplicate / import / apply), with no extra fetch.
  init(
    teamService: any TeamService,
    dexLookup: any DexLookupService = EmptyDexLookupService(),
    team: Team,
    warnings: [TeamWarning] = []
  ) {
    self.teamService = teamService
    self.dexLookup = dexLookup
    self.teamId = team.id
    self.format = team.format
    self.name = team.name
    let rows = team.members.map(EditableMember.init(from:))
    self.members = rows
    self.savedTeam = team
    self.warnings = warnings
    self.lastPersisted = Self.persistable(name: team.name, members: rows)
  }

  // MARK: Loading

  /// Loads the full team (members + computed warnings) for an existing team
  /// (M-AC-T1.2). A no-op for an unsaved team. Never throws: a failure surfaces as
  /// ``errorMessage``.
  func load() async {
    guard let teamId else { return }
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let (team, validation) = try await teamService.get(id: teamId)
      apply(saved: team, validation: validation)
      await refreshSprites()
      await refreshAllMovepools()
      scheduleAnalysis()
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
    } catch {
      errorMessage = Self.genericMessage
    }
  }

  // MARK: Dex lookups (search / learnset / sprites — never throw)

  /// Live typeahead over `/api/search`, scoped to this editor's fixed format — backs the
  /// species/item ``EntityPickerSheet``s. An empty/failed lookup just shows no suggestions.
  /// Champions index even for archived teams (CF-TEAM-AC-5.4) — stored gen-N
  /// is not a Dex lookup scope.
  private var lookupFormat: Format { .champions }

  func searchEntities(kind: EntityKind, query: String) async -> [PickerOption] {
    await dexLookup.search(kind: kind, query: query, format: lookupFormat)
      .map { PickerOption(slug: $0.slug, displayName: $0.displayName) }
  }

  /// Re-resolves sprite/type/ability/base-stat refs for every filled species slot in one
  /// batch call, then applies the Mega required-item auto-force (mirrors `TeamEditor.tsx`'s
  /// `resolveSprites` + required-item effects). Call after any species change.
  func refreshSprites() async {
    let species = Set(members.map(\.species).filter { !$0.isEmpty })
    guard !species.isEmpty else {
      spriteRefsBySpecies = [:]
      return
    }
    let refs = await dexLookup.sprites(names: Array(species), format: lookupFormat)
    spriteRefsBySpecies = refs
    applyMegaAutoForce()
  }

  /// Fetches the legal movepool for one member's species (`GET /api/learnset`), keyed by
  /// the member's stable id so it survives reordering. An empty/unset species clears the
  /// cached movepool for that slot.
  func refreshMovepool(for memberId: UUID) async {
    guard let member = members.first(where: { $0.id == memberId }), !member.species.isEmpty else {
      movepoolByMemberId[memberId] = []
      return
    }
    movepoolByMemberId[memberId] = await dexLookup.learnset(
      pokemon: member.species, format: lookupFormat)
  }

  /// Refetches every filled slot's movepool — used after a full team load (M-AC-T1.2),
  /// since the individual per-species `.onChange` triggers only fire on further edits.
  func refreshAllMovepools() async {
    for member in members where !member.species.isEmpty {
      await refreshMovepool(for: member.id)
    }
  }

  /// The resolved sprite/type ref for a member's species, or `nil` when unresolved/unset.
  func spriteRef(for species: String) -> DexSpriteRef? {
    species.isEmpty ? nil : spriteRefsBySpecies[species]
  }

  /// The species' legal ability slugs as picker options (the Ability picker's ONLY
  /// offered choices) — mirrors `abilityOptions` in `TeamMemberPanel.tsx`. Empty when the
  /// species is unresolved (the picker then just offers nothing until it resolves).
  func abilityOptions(for species: String) -> [PickerOption] {
    (spriteRef(for: species)?.abilities ?? []).map {
      PickerOption(slug: $0, displayName: TeamBlocksView.titleizeNonNil($0))
    }
  }

  /// The species' legal movepool as picker options, sorted by display name — the Move
  /// pickers' ONLY offered choices. `hint` carries the F1 metadata (type · category ·
  /// power) shown in the moves table on web.
  func movepoolOptions(for memberId: UUID) -> [PickerOption] {
    (movepoolByMemberId[memberId] ?? [])
      .map { PickerOption(slug: $0.slug, displayName: $0.displayName, hint: Self.moveHint(for: $0)) }
      .sorted { $0.displayName < $1.displayName }
  }

  /// A Mega (or any form with a `required_item`) must hold its stone: force every filled
  /// slot's item to its species' `required_item` once resolved, idempotent (mirrors the
  /// `TeamEditor.tsx` required-item effect exactly — only forces forward, never clears a
  /// stone if the species changes away from a Mega).
  private func applyMegaAutoForce() {
    for index in members.indices {
      let species = members[index].species
      guard !species.isEmpty, let stone = spriteRefsBySpecies[species]?.requiredItem,
        !stone.isEmpty
      else { continue }
      if members[index].item != stone {
        members[index].item = stone
      }
    }
  }

  /// "Fire · Special · 90" style summary for a learnset move's metadata columns; a `nil`
  /// field is simply omitted rather than shown as a placeholder.
  private static func moveHint(for move: LearnsetMove) -> String? {
    var parts: [String] = []
    if let type = move.type { parts.append(TeamBlocksView.titleizeNonNil(type)) }
    if let damageClass = move.damageClass {
      parts.append(TeamBlocksView.titleizeNonNil(damageClass.rawValue))
    }
    if let power = move.power { parts.append("\(power) power") }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  // MARK: Member editing

  /// Adds an empty member set (M-AC-T1.1); a no-op at the 6-slot cap (M-BR-T2 roster).
  func addMember() {
    guard members.count < 6 else { return }
    members.append(EditableMember())
    scheduleSave()
  }

  /// Removes the member set at `index`.
  func removeMember(at index: Int) {
    guard members.indices.contains(index) else { return }
    members.remove(at: index)
    scheduleSave()
  }

  /// Moves the member at `from` to `to` (insert, not swap). A no-op when
  /// read-only, the indices match, or either index is out of bounds. Row
  /// identity is preserved so cached movepools stay attached.
  func moveMember(from: Int, to: Int) {
    guard !isReadOnly else { return }
    guard from != to else { return }
    guard members.indices.contains(from), members.indices.contains(to) else { return }
    let item = members.remove(at: from)
    members.insert(item, at: to)
    scheduleSave()
  }

  /// `true` when another slot can be added (drives the "Add Pokémon" affordance).
  var canAddMember: Bool { members.count < 6 }

  /// The EV total for a slot — shown next to the steppers (warned, never blocked, when
  /// over 508).
  func evTotal(for member: EditableMember) -> Int {
    member.evs.total
  }

  /// Warnings scoped to one member slot (by index), for inline display under the set.
  func warnings(forSlot index: Int) -> [TeamWarning] {
    warnings.filter { $0.slot == index }
  }

  /// Team-level warnings (no slot — e.g. species/item clauses, incompleteness).
  var teamLevelWarnings: [TeamWarning] {
    warnings.filter { $0.slot == nil }
  }

  // MARK: Autosave (warn-but-allow — never blocked)

  /// Schedules a debounced persist of the current draft. Rapid edits coalesce into one
  /// write carrying the latest snapshot. A no-op when read-only or when the draft matches
  /// the last successful persist (opening New and leaving without edits creates nothing).
  func scheduleSave() {
    guard canSave else { return }
    persistFailed = false
    debounceTask?.cancel()
    let delay = saveDebounce
    debounceTask = Task { [weak self] in
      if delay > .zero { try? await Task.sleep(for: delay) }
      if Task.isCancelled { return }
      await self?.kickPersist()
    }
  }

  /// Cancels the debounce window and persists immediately (leave / background / export).
  /// Retries a previous failed write so a back-tap after a dropped request still lands.
  func flushSave() async {
    guard canSave else { return }
    debounceTask?.cancel()
    debounceTask = nil
    persistFailed = false
    if persistableSnapshot() != lastPersisted { forcePersist = true }
    await kickPersist()
  }

  /// Awaits the in-flight debounce + persist, if any. Test support.
  func awaitSave() async {
    await debounceTask?.value
    await persistTask?.value
  }

  /// Clears the transient "Saved" badge; the screen calls this after its ~1s window.
  func consumeSaveConfirmation() {
    showSaveConfirmation = false
  }

  /// Saves the team (create when new, replace when existing). **Never blocked by
  /// warnings** (M-AC-T3.1). Explicit write used by tests and by ``flushSave`` when
  /// the draft is dirty; always issues the request even if the snapshot is unchanged.
  @discardableResult
  func save() async -> Team? {
    guard canSave else { return nil }
    debounceTask?.cancel()
    debounceTask = nil
    persistFailed = false
    forcePersist = true
    await kickPersist()
    return errorMessage == nil ? savedTeam : nil
  }

  /// Serializes persist loops so a create in flight never races a second create.
  private func kickPersist() async {
    guard canSave else { return }
    if let persistTask {
      await persistTask.value
      if persistFailed { return }
      if canSave, persistableSnapshot() != lastPersisted || forcePersist {
        await kickPersist()
      }
      return
    }
    let task = Task { [weak self] in
      guard let self else { return }
      await self.runPersistLoop()
    }
    persistTask = task
    await task.value
    persistTask = nil
    if persistFailed { return }
    if canSave, persistableSnapshot() != lastPersisted || forcePersist {
      await kickPersist()
    }
  }

  private func runPersistLoop() async {
    while canSave {
      let snapshot = persistableSnapshot()
      if snapshot == lastPersisted && !forcePersist { return }
      forcePersist = false
      if await persist(snapshot) == nil { return }
    }
  }

  /// One create-or-update. On success, adopts `teamId` + warnings without rebuilding
  /// the live member rows (autosave must not steal focus or mint new UUIDs).
  @discardableResult
  private func persist(_ snapshot: PersistableDraft) async -> Team? {
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }

    do {
      let result: (team: Team, validation: TeamValidationResult)
      if let teamId {
        result = try await teamService.update(
          id: teamId, name: snapshot.name, members: snapshot.members)
      } else {
        result = try await teamService.create(
          format: .champions, name: snapshot.name, members: snapshot.members)
      }
      persistFailed = false
      applySaveResult(team: result.team, validation: result.validation, sent: snapshot)
      showSaveConfirmation = true
      return result.team
    } catch let error as OakError {
      persistFailed = true
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      persistFailed = true
      errorMessage = Self.genericMessage
      return nil
    }
  }

  private func persistableSnapshot() -> PersistableDraft {
    Self.persistable(name: name, members: members)
  }

  private static func persistable(name: String, members: [EditableMember]) -> PersistableDraft {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return PersistableDraft(
      name: trimmed.isEmpty ? nil : trimmed,
      members: members.map { livingLegalize($0.asTeamMember()) }
    )
  }

  // MARK: Team analysis (draft coverage — debounced, never blocks)

  /// Schedules a debounced coverage analysis of the CURRENT draft (#9). Cancels any pending
  /// request and fires a fresh one after ``analysisDebounce``, so a burst of edits collapses to
  /// one call carrying the latest draft. A draft with no filled species clears the result and
  /// makes no request. Fire-and-forget: never awaited on any editing path.
  func scheduleAnalysis() {
    runAnalysis(afterDelay: analysisDebounce)
  }

  /// Re-runs the analysis immediately (no debounce) — the Analysis section's Retry after a
  /// failed request. Clears the error first so the panel returns to its loading state.
  func retryAnalysis() {
    analysisError = nil
    runAnalysis(afterDelay: .zero)
  }

  /// Awaits the in-flight analysis task, if any. Test support (deterministic settling); a no-op
  /// once the current request has resolved.
  func awaitAnalysis() async {
    await analysisTask?.value
  }

  /// The debounce/generation-guarded core behind ``scheduleAnalysis()`` / ``retryAnalysis()``.
  /// Snapshots the draft NOW (`scheduleAnalysis` is called on every change, so the newest schedule
  /// carries the newest draft), cancels the prior task, and applies the result only if this
  /// schedule is still the latest (generation guard) and wasn't cancelled — so a stale response
  /// never clobbers a newer one, and an error retains the last good analysis.
  private func runAnalysis(afterDelay delay: Duration) {
    analysisTask?.cancel()
    analysisGeneration += 1
    let generation = analysisGeneration
    let snapshot = draftWireMembers()
    // `asTeamMember()` maps a blank species to `nil`, so a filled slot has a non-nil species.
    guard snapshot.contains(where: { $0.species != nil }) else {
      analysis = nil
      analysisError = nil
      isAnalyzing = false
      return
    }
    let format = self.format
    isAnalyzing = true
    analysisTask = Task { [weak self] in
      if delay > .zero { try? await Task.sleep(for: delay) }
      if Task.isCancelled { return }
      guard let self else { return }
      var result: TeamAnalysis?
      var failure: String?
      do {
        result = try await self.teamService.analyze(format: format, members: snapshot)
      } catch let error as OakError {
        failure = Self.message(for: error)
      } catch {
        failure = Self.genericMessage
      }
      // Superseded by a newer schedule (or cancelled) → discard silently.
      if Task.isCancelled || generation != self.analysisGeneration { return }
      self.isAnalyzing = false
      if let result {
        self.analysis = result
        self.analysisError = nil
      } else {
        // Keep the last good analysis; surface the error for a Retry.
        self.analysisError = failure
      }
    }
  }

  // MARK: Export

  /// Renders the saved team as Showdown paste text (M-TEAM-US-2). Flushes a pending
  /// autosave first so a just-edited new team can export without a Save tap.
  func exportPaste() async -> String? {
    await flushSave()
    guard let teamId else {
      errorMessage = "Save the team before exporting."
      return nil
    }
    do {
      return try await teamService.exportPaste(id: teamId)
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

  private static let perfectIVs = StatSpread(
    hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31
  )

  /// Persist tera null, level 50, IVs 31; Stat Points stay in `evs` (ADR-7).
  private static func livingLegalize(_ member: TeamMember) -> TeamMember {
    TeamMember(
      species: member.species,
      ability: member.ability,
      item: member.item,
      moves: member.moves,
      nature: member.nature,
      evs: member.evs,
      ivs: perfectIVs,
      teraType: nil,
      level: 50,
      nickname: member.nickname,
      gender: member.gender,
      shiny: member.shiny
    )
  }

  // MARK: Teams-assistant draft bridge (Apply / Undo — in-memory draft only)

  /// The live, unsaved draft as wire ``TeamMember``s — what rides EVERY assistant turn
  /// (`TeamsAssistantDraft.members`) and the base ``applyTeamPatch`` operates on. Same
  /// conversion the Save path uses (empty strings → `nil`, blank moves dropped).
  func draftWireMembers() -> [TeamMember] {
    members.map { $0.asTeamMember() }
  }

  /// An exact snapshot of the editable draft (name + rows), captured before an
  /// assistant Apply so ``restoreDraft(_:)`` (Undo) can put it back verbatim.
  func draftSnapshot() -> TeamDraftSnapshot {
    TeamDraftSnapshot(name: name, members: members)
  }

  /// Restores a draft snapshot (assistant Undo). Sprites/movepools re-resolve for the
  /// restored rows; autosave persists the restored draft.
  func restoreDraft(_ snapshot: TeamDraftSnapshot) {
    name = snapshot.name
    members = snapshot.members
    scheduleAnalysis()
    scheduleSave()
    Task {
      await refreshSprites()
      await refreshAllMovepools()
    }
  }

  /// Applies an assistant ``TeamPatch`` to the in-memory draft (mirrors the web panel's
  /// Apply: `applyTeamPatch` on the current members + an optional rename). Autosave
  /// persists the patched rows. The slot edits reuse the exact pure ``applyTeamPatch``
  /// the server legality-gate ran, so applied ≡ validated.
  func applyAssistantPatch(_ patch: TeamPatch) {
    let patched = applyTeamPatch(draftWireMembers(), patch)
    members = patched.map(EditableMember.init(from:))
    if let newName = patch.name {
      name = newName
    }
    scheduleAnalysis()
    scheduleSave()
    Task {
      await refreshSprites()
      await refreshAllMovepools()
    }
  }

  // MARK: Internals

  /// Adopts a server-returned team as the editor's canonical state on **load** — the
  /// server may normalize fields, so the editable rows are rebuilt from the saved members.
  private func apply(saved team: Team, validation: TeamValidationResult) {
    teamId = team.id
    name = team.name
    members = team.members.map(EditableMember.init(from:))
    savedTeam = team
    warnings = validation.warnings
    lastPersisted = persistableSnapshot()
  }

  /// Autosave success: keep the live draft (and member UUIDs) intact so focus, steppers,
  /// and pickers do not reset. Only identity, warnings, and the dirty snapshot update.
  private func applySaveResult(
    team: Team, validation: TeamValidationResult, sent: PersistableDraft
  ) {
    teamId = team.id
    savedTeam = team
    warnings = validation.warnings
    lastPersisted = sent
    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      name = team.name
      lastPersisted = PersistableDraft(name: team.name, members: sent.members)
    }
  }

  // MARK: Picker option sets (fixed; no index reads)

  /// The 25 nature slugs, for the nature picker (natures aren't in the searchable index;
  /// the server validates against this same fixed set).
  static let natures: [String] = [
    "hardy", "lonely", "brave", "adamant", "naughty",
    "bold", "docile", "relaxed", "impish", "lax",
    "timid", "hasty", "serious", "jolly", "naive",
    "modest", "mild", "quiet", "bashful", "rash",
    "calm", "gentle", "sassy", "careful", "quirky",
  ]

  /// The 18 type slugs, for the Tera-type picker.
  static let teraTypes: [String] = [
    "normal", "fire", "water", "electric", "grass", "ice",
    "fighting", "poison", "ground", "flying", "psychic", "bug",
    "rock", "ghost", "dragon", "dark", "steel", "fairy",
  ]

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

/// An exact, restorable snapshot of the editor draft (name + editable rows) — the
/// undo target for a Teams-assistant Apply. Captured before Apply mutates the draft;
/// ``TeamEditorViewModel/restoreDraft(_:)`` puts it back verbatim (preserving each
/// row's identity, so the form doesn't churn).
struct TeamDraftSnapshot: Equatable, Sendable {
  let name: String
  let members: [EditableMember]
}

/// Wire payload used for dirty-checking autosave. Compares legalized members, not
/// UI identity UUIDs, so two empty slots with different ids are equal.
private struct PersistableDraft: Equatable, Sendable {
  let name: String?
  let members: [TeamMember]
}

// MARK: - Editable value models (two-way bound by the form)

/// A mutable, form-bindable EV/IV spread. The wire ``StatSpread`` is immutable (`let`),
/// so the editor edits this and converts on save.
struct EditableStatSpread: Equatable, Sendable {
  var hp: Int
  var atk: Int
  var def: Int
  var spa: Int
  var spd: Int
  var spe: Int

  /// The six-stat total (for the EV-budget readout; >508 is warned, never blocked).
  var total: Int { hp + atk + def + spa + spd + spe }

  init(hp: Int = 0, atk: Int = 0, def: Int = 0, spa: Int = 0, spd: Int = 0, spe: Int = 0) {
    self.hp = hp
    self.atk = atk
    self.def = def
    self.spa = spa
    self.spd = spd
    self.spe = spe
  }

  init(from spread: StatSpread) {
    self.init(
      hp: spread.hp, atk: spread.atk, def: spread.def,
      spa: spread.spa, spd: spread.spd, spe: spread.spe
    )
  }

  /// The immutable wire spread for persistence.
  func asStatSpread() -> StatSpread {
    StatSpread(hp: hp, atk: atk, def: def, spa: spa, spd: spd, spe: spe)
  }
}

/// A mutable, form-bindable member set. The wire ``TeamMember`` uses `nil`/optional
/// slugs and a variable-length `moves` array; the editor uses empty strings and a
/// fixed 4-move grid for clean bindings, converting on save (empty → `nil`, blank moves
/// dropped).
struct EditableMember: Identifiable, Equatable, Sendable {
  let id: UUID
  var species: String
  var ability: String
  var item: String
  /// Exactly four move slots (empty string = unset) for a stable form grid.
  var moves: [String]
  var nature: String
  var evs: EditableStatSpread
  var ivs: EditableStatSpread
  var teraType: String
  var level: Int
  var nickname: String
  var gender: TeamMember.Gender?
  var shiny: Bool

  /// A fresh empty slot: no entries, zero EVs, perfect (31) IVs, level 50 (both formats'
  /// default).
  init() {
    self.id = UUID()
    self.species = ""
    self.ability = ""
    self.item = ""
    self.moves = ["", "", "", ""]
    self.nature = ""
    self.evs = EditableStatSpread()
    self.ivs = EditableStatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31)
    self.teraType = ""
    self.level = 50
    self.nickname = ""
    self.gender = nil
    self.shiny = false
  }

  /// Builds an editable row from a stored ``TeamMember`` (nil → "", moves padded to 4).
  init(from member: TeamMember) {
    self.id = UUID()
    self.species = member.species ?? ""
    self.ability = member.ability ?? ""
    self.item = member.item ?? ""
    let padded = member.moves + Array(repeating: "", count: max(0, 4 - member.moves.count))
    self.moves = Array(padded.prefix(4))
    self.nature = member.nature ?? ""
    self.evs = EditableStatSpread(from: member.evs)
    self.ivs = EditableStatSpread(from: member.ivs)
    self.teraType = member.teraType ?? ""
    self.level = member.level
    self.nickname = member.nickname ?? ""
    self.gender = member.gender
    self.shiny = member.shiny ?? false
  }

  /// Converts back to the wire ``TeamMember``: trimmed empty strings become `nil`, blank
  /// move slots are dropped, and `shiny` is emitted only when true (server convention).
  func asTeamMember() -> TeamMember {
    func slug(_ value: String) -> String? {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    let resolvedMoves =
      moves
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    return TeamMember(
      species: slug(species),
      ability: slug(ability),
      item: slug(item),
      moves: Array(resolvedMoves.prefix(4)),
      nature: slug(nature),
      evs: evs.asStatSpread(),
      ivs: ivs.asStatSpread(),
      teraType: slug(teraType),
      level: level,
      nickname: slug(nickname),
      gender: gender,
      shiny: shiny ? true : nil
    )
  }
}
