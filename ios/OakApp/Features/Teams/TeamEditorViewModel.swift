import Foundation
import Observation

/// The full-set team editor's view model (history-and-teams.md M-TEAM-US-1/3;
/// component-design.md "TeamEditorViewModel"). Holds the editable team (name + up to 6
/// member sets, each with species / ability / item / four moves / nature / EVs / IVs /
/// Tera / level), drives save (create-or-update), and surfaces the server's
/// **warn-but-allow** validation — warnings are rendered but **never block save**
/// (M-AC-T3.1 / M-BR-T3).
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

  /// The team's fixed data-scope format (M-BR-T2). Set at creation; never edited.
  let format: Format

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

  /// `true` while the initial load (existing team) is in flight.
  private(set) var isLoading: Bool = false

  /// A user-facing error message for the last failed operation, or `nil` when clear.
  private(set) var errorMessage: String?

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
    self.format = format
    self.name = name
    self.members = [EditableMember()]
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
    self.members = team.members.map(EditableMember.init(from:))
    self.savedTeam = team
    self.warnings = warnings
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
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
    } catch {
      errorMessage = Self.genericMessage
    }
  }

  // MARK: Dex lookups (search / learnset / sprites — never throw)

  /// Live typeahead over `/api/search`, scoped to this editor's fixed format — backs the
  /// species/item ``EntityPickerSheet``s. An empty/failed lookup just shows no suggestions.
  func searchEntities(kind: EntityKind, query: String) async -> [PickerOption] {
    await dexLookup.search(kind: kind, query: query, format: format)
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
    let refs = await dexLookup.sprites(names: Array(species), format: format)
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
    movepoolByMemberId[memberId] = await dexLookup.learnset(pokemon: member.species, format: format)
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
  }

  /// Removes the member set at `index`.
  func removeMember(at index: Int) {
    guard members.indices.contains(index) else { return }
    members.remove(at: index)
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

  // MARK: Save (warn-but-allow — never blocked)

  /// Saves the team (create when new, replace when existing). **Never blocked by
  /// warnings** (M-AC-T3.1): the request always goes out, and the returned warnings are
  /// shown afterward. Returns the saved ``Team`` or `nil` on a transport/HTTP failure.
  @discardableResult
  func save() async -> Team? {
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }

    let memberPayload = members.map { $0.asTeamMember() }
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let namePayload = trimmedName.isEmpty ? nil : trimmedName

    do {
      let result: (team: Team, validation: TeamValidationResult)
      if let teamId {
        result = try await teamService.update(id: teamId, name: namePayload, members: memberPayload)
      } else {
        result = try await teamService.create(format: format, name: namePayload, members: memberPayload)
      }
      apply(saved: result.team, validation: result.validation)
      await refreshSprites()
      await refreshAllMovepools()
      return result.team
    } catch let error as OakError {
      errorMessage = Self.message(for: error)
      return nil
    } catch {
      errorMessage = Self.genericMessage
      return nil
    }
  }

  // MARK: Export

  /// Renders the saved team as Showdown paste text (M-TEAM-US-2). Requires a saved team
  /// (an id); for an unsaved team it surfaces a hint and returns `nil`.
  func exportPaste() async -> String? {
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

  /// Restores a draft snapshot (assistant Undo). Nothing here touches the DB — the
  /// user still reviews and Saves. Sprites/movepools re-resolve for the restored rows.
  func restoreDraft(_ snapshot: TeamDraftSnapshot) {
    name = snapshot.name
    members = snapshot.members
    Task {
      await refreshSprites()
      await refreshAllMovepools()
    }
  }

  /// Applies an assistant ``TeamPatch`` to the in-memory draft (mirrors the web panel's
  /// Apply: `applyTeamPatch` on the current members + an optional rename). The DB is
  /// untouched — the patched rows land in the editor's unsaved state and the user still
  /// hits Save (which is where validation warnings refresh). The slot edits reuse the
  /// exact pure ``applyTeamPatch`` the server legality-gate ran, so applied ≡ validated.
  func applyAssistantPatch(_ patch: TeamPatch) {
    let patched = applyTeamPatch(draftWireMembers(), patch)
    members = patched.map(EditableMember.init(from:))
    if let newName = patch.name {
      name = newName
    }
    Task {
      await refreshSprites()
      await refreshAllMovepools()
    }
  }

  // MARK: Internals

  /// Adopts a server-returned team as the editor's canonical state — the server may
  /// normalize fields, so the editable rows are rebuilt from the saved members.
  private func apply(saved team: Team, validation: TeamValidationResult) {
    teamId = team.id
    name = team.name
    members = team.members.map(EditableMember.init(from:))
    savedTeam = team
    warnings = validation.warnings
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
