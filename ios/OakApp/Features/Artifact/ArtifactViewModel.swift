import Foundation
import Observation

/// Drives the artifact bottom sheet (artifact-viewer.md M-ART-US-1/2/3, M-BR-ART-1/4/5).
///
/// The viewer behaves like a small in-app browser over the chat: it shows **one artifact at a
/// time** (M-BR-ART-1) and keeps a **back stack** so drilling from one artifact into another
/// (a Pokémon → one of its moves, a team → a member) pushes a new entry, and a back control
/// returns to the previous one (M-ART-US-3). The visible artifact is always the top of the
/// stack; an empty stack means the sheet is closed.
///
/// `@MainActor @Observable` — all state mutates on the main actor and the sheet observes it
/// directly. It depends on the ``ArtifactService`` **protocol** (never `LiveArtifactService`)
/// so it unit-tests against `FakeArtifactService`. Entity/saved-team artifacts fetch through the
/// service; a **proposed-team** artifact uses the inline data already delivered with the answer,
/// so opening it is instant with no round-trip (M-AC-A4.1).
///
/// Honest failure (M-BR-ART-5, conventions.md ArtifactService policy): a fetch that comes back
/// `nil` / `not_found` / `unavailable` resolves the entry to an `.unavailable` state rather than
/// throwing or silently popping it — the sheet stays open and the user can always get back to
/// chatting with a single gesture.
@MainActor
@Observable
final class ArtifactViewModel {

  /// The back stack. The **last** element is the visible artifact (one at a time, M-BR-ART-1);
  /// an empty stack closes the sheet.
  private(set) var stack: [Artifact] = []

  // MARK: Dependencies

  private let service: any ArtifactService
  /// The active data scope for entity fetches (M-BR-ART-4) — derived from the chat's mode and
  /// fixed for the viewer's lifetime, so the model has no way to widen scope.
  private let format: Format
  private let isSignedIn: Bool
  private let pins: (any ArtifactPinService)?
  var conversationId: String?

  private(set) var compareErrorMessage: String?
  private(set) var pinErrorMessage: String?
  private(set) var lastCompareDiff: PokemonCompareDiff?
  private var lastEntityQuery: String?
  private var lastEntityKind: EntityKind?

  /// The viewer's fixed request scope — what every entity fetch is scoped to. Exposed so the
  /// entity detail can badge a National-Dex fallback ("not found in <this scope>"): on the
  /// fallback path the artifact's own `format`/`source_format` are both `national-dex`, so the
  /// requested scope has to come from here, not the envelope.
  var requestFormat: Format { format }

  init(
    service: any ArtifactService,
    format: Format,
    isSignedIn: Bool = false,
    pins: (any ArtifactPinService)? = nil,
    conversationId: String? = nil
  ) {
    self.service = service
    self.format = format
    self.isSignedIn = isSignedIn
    self.pins = pins
    self.conversationId = conversationId
  }

  // MARK: Derived presentation state

  /// The currently visible artifact (top of the stack), or `nil` when the viewer is closed.
  var current: Artifact? { stack.last }

  /// Whether the sheet should be presented — drives the host's `.sheet(isPresented:)` binding.
  var isPresented: Bool { !stack.isEmpty }

  /// Whether a back control belongs in the sheet (more than one artifact on the stack).
  var canGoBack: Bool { stack.count > 1 }

  // MARK: Opening artifacts (push)

  /// Opens an entity (Pokémon/move/ability/item/type) by resolving its full profile for the
  /// active format (M-ART-US-1, M-BR-ART-4). Pushes a `.loading` entry immediately so the sheet
  /// responds at once, then fills it in when the fetch returns; a `nil`/`not_found`/`unavailable`
  /// result resolves to `.unavailable` so the sheet never breaks. `async` so the View can fire it
  /// in a `Task` and tests can await the settled state.
  func openEntity(kind: EntityKind, query: String) async {
    lastEntityKind = kind
    lastEntityQuery = query
    let entry = Artifact(title: query, content: .loading)
    stack.append(entry)
    let result = await service.entity(kind: kind, q: query, format: format)
    guard let index = stack.firstIndex(where: { $0.id == entry.id }) else { return }
    switch result {
    case .ok(let ok)?:
      stack[index] = Artifact(id: entry.id, title: ok.resolved.displayName, content: .entity(ok))
    case .notFound(let miss)?:
      // An honest resolution miss — carry the server's (now populated) close-name
      // suggestions so the sheet can offer them as tappable retries (#2).
      stack[index] = Artifact(
        id: entry.id,
        title: query,
        content: .unavailable(kind: kind, query: query, suggestions: miss.suggestions)
      )
    default:
      // `.unavailable` (index down) or `nil` (transport) — no suggestions to offer.
      stack[index] = Artifact(
        id: entry.id,
        title: query,
        content: .unavailable(kind: kind, query: query, suggestions: [])
      )
    }
  }

  /// Opens the agent's **proposed team** using the INLINE data already delivered with the answer
  /// (no fetch — M-AC-A4.1). Synchronous: the team sheet appears instantly.
  func openProposedTeam(_ team: ProposedTeam, warnings: [TeamWarning]) {
    let artifact = TeamArtifact(
      name: team.name,
      format: team.format,
      members: team.members,
      warnings: warnings,
      savedId: nil
    )
    stack.append(Artifact(title: team.name, content: .team(artifact)))
  }

  /// Opens a side-by-side **comparison** of the answer's subjects using the INLINE
  /// data delivered with the answer (no fetch — mirrors web's `comparison` structured
  /// artifact). Synchronous: the sheet appears instantly.
  func openComparison(_ subjects: [Subject]) {
    lastCompareDiff = nil
    stack.append(Artifact(title: "Comparison", content: .comparison(subjects: subjects)))
  }

  /// Opens the answer's **damage calculation** using its INLINE `damage_calc` (no
  /// fetch — mirrors web's `damage-calc` structured artifact). Synchronous.
  func openDamageCalc(_ damageCalc: DamageCalc) {
    stack.append(Artifact(title: "Damage calculation", content: .damageCalc(damageCalc)))
  }

  /// Opens a **saved team** by id, fetching its members + warnings fresh (M-AC-A3.2: the
  /// saved-team card's "Open in viewer"). Pushes a `.loading` entry, then resolves to the team or
  /// `.teamUnavailable` if it can't be loaded.
  func openSavedTeam(id: String, name: String) async {
    let entry = Artifact(title: name, content: .loading)
    stack.append(entry)
    let result = await service.savedTeam(id: id)
    guard let index = stack.firstIndex(where: { $0.id == entry.id }) else { return }
    if let result {
      let artifact = TeamArtifact(
        name: result.team.name,
        format: result.team.format,
        members: result.team.members,
        warnings: result.validation.warnings,
        savedId: result.team.id
      )
      stack[index] = Artifact(id: entry.id, title: result.team.name, content: .team(artifact))
    } else {
      stack[index] = Artifact(id: entry.id, title: name, content: .teamUnavailable)
    }
  }

  // MARK: Navigation

  /// Returns to the previous artifact (M-AC-A3.2). At the root, backing out dismisses the sheet.
  func back() {
    guard stack.count > 1 else {
      dismiss()
      return
    }
    stack.removeLast()
  }

  func openSnapshot(_ artifact: Artifact) {
    stack.append(artifact)
  }

  /// Closes the viewer and clears the back stack — the single-gesture return to chat
  /// (M-AC-A3.3, M-BR-ART-5). Artifacts are ephemeral (M-BR-ART-2), so nothing is persisted.
  func dismiss() {
    stack.removeAll()
    lastEntityQuery = nil
    lastEntityKind = nil
    compareErrorMessage = nil
    pinErrorMessage = nil
    lastCompareDiff = nil
  }

  // MARK: Open in Dex / Compare / Pin

  var canOpenInDex: Bool {
    guard case .entity(let ok)? = current?.content else { return false }
    switch ok.kind {
    case .pokemon, .move, .ability, .item: return true
    case .type, .unsupported: return false
    }
  }

  func openInDex() -> DexArtifactHop? {
    guard canOpenInDex, case .entity(let ok)? = current?.content else { return nil }
    let query = lastEntityQuery ?? ok.resolved.displayName
    return DexArtifactHop(kind: ok.kind, query: query, format: format)
  }

  func compareWith(species: String, format: Format?) async {
    guard case .entity(let first)? = current?.content, case .pokemon(let leftData) = first.data else { return }
    compareErrorMessage = nil
    let scope = format ?? self.format
    let result = await service.entity(kind: .pokemon, q: species, format: scope)
    guard case .ok(let second)? = result, case .pokemon(let rightData) = second.data else {
      compareErrorMessage = "Couldn't find \(species) to compare."
      return
    }
    lastCompareDiff = diffPokemonProfiles(
      PokemonCompareSubject(format: first.format, profile: leftData, set: nil, offensive: nil),
      PokemonCompareSubject(format: scope, profile: rightData, set: nil, offensive: nil)
    )
    let left = subject(from: first, nameOverride: nil)
    let right = subject(from: second, nameOverride: species)
    stack.append(Artifact(title: "Comparison", content: .comparison(subjects: [left, right].compactMap { $0 })))
  }

  var canPin: Bool {
    guard isSignedIn, let current else { return false }
    switch current.content {
    case .team, .comparison, .damageCalc: return true
    default: return false
    }
  }

  func pin() async -> ArtifactPinCreateResult {
    guard canPin, let current, let pins else {
      return .failure(.failed)
    }
    let kind: ArtifactPinKind
    switch current.content {
    case .team: kind = .teamSheet
    case .comparison: kind = .comparison
    case .damageCalc: kind = .calc
    default:
      return .failure(.failed)
    }
    let result = await pins.create(
      conversationId: conversationId ?? "",
      kind: kind,
      title: current.title,
      snapshot: current
    )
    if case .failure(.pinCap) = result {
      pinErrorMessage = "You can pin up to 5 artifacts in a conversation."
    } else {
      pinErrorMessage = nil
    }
    return result
  }

  private func subject(from ok: EntityArtifactOk, nameOverride: String?) -> Subject? {
    guard case .pokemon(let data) = ok.data else { return nil }
    return Subject(
      name: nameOverride ?? data.displayName,
      dexNumber: data.nationalDexNumber,
      spriteUrl: data.spriteUrl,
      types: data.types,
      isFallback: ok.isFallback,
      sourceGeneration: data.sourceGeneration
    )
  }
}

/// Dex hop from an artifact header (DEX-US-1/2). Format is written before the
/// entity route is queued so the tab does not silently fall back.
struct DexArtifactHop: Equatable, Sendable {
  let kind: EntityKind
  let query: String
  let format: Format
}

// MARK: - Artifact model

/// One entry on the viewer's back stack: a stable identity, the title shown in the sheet's nav
/// bar, and the content to render. A value type whose `content` is replaced in place as an async
/// fetch settles.
struct Artifact: Identifiable, Sendable {
  let id: UUID
  var title: String
  var content: ArtifactContent

  init(id: UUID = UUID(), title: String, content: ArtifactContent) {
    self.id = id
    self.title = title
    self.content = content
  }
}

/// What an ``Artifact`` is showing — a small closed set mirroring the web viewer's artifact
/// kinds (entity profile, team sheet) plus the transient loading/miss states the native sheet
/// needs. Artifacts are ephemeral (M-BR-ART-2); this is never persisted.
enum ArtifactContent: Sendable {
  /// Awaiting a fetch (entity or saved team).
  case loading
  /// A resolved entity profile (Pokémon/move/ability/item/type) — rendered by ``EntityDetailView``.
  case entity(EntityArtifactOk)
  /// A team sheet — the agent's proposed team (inline) or a fetched saved team.
  case team(TeamArtifact)
  /// A side-by-side comparison of the answer's subjects — rendered from the answer's
  /// INLINE payload (no fetch). Mirrors the web `comparison` structured artifact.
  case comparison(subjects: [Subject])
  /// A worked damage calculation — rendered from the answer's INLINE `damage_calc`
  /// (no fetch). Mirrors the web `damage-calc` structured artifact.
  case damageCalc(DamageCalc)
  /// An entity that couldn't be shown (`not_found` / `unavailable` / transport) — an honest miss
  /// (M-BR-ART-5), carrying the original kind + query for the message and, on a `not_found`, the
  /// server's close-name `suggestions` (empty otherwise) to offer as tappable retries (#2).
  case unavailable(kind: EntityKind, query: String, suggestions: [String])
  /// A saved team that couldn't be loaded.
  case teamUnavailable
}

/// A team rendered in the viewer — unified across the agent's **proposed** team (inline, no
/// fetch) and a **saved** team (fetched). `savedId` is non-nil only for a saved team.
struct TeamArtifact: Sendable, Equatable {
  let name: String
  let format: Format
  let members: [TeamMember]
  let warnings: [TeamWarning]
  /// The team's id when it is a persisted saved team; `nil` for an ephemeral proposed team.
  let savedId: String?
}
