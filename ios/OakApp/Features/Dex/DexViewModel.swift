import Foundation
import Observation

/// Drives the Dex tab list: section chips, scope format, debounced search, and the
/// match list from ``DexLookupService``. Detail navigation lives on the view
/// (`NavigationPath`); this model only owns list state so unit tests can assert
/// reloads without standing up SwiftUI.
@MainActor
@Observable
final class DexViewModel {
  /// Active reference section (Pokémon / Moves / Abilities / Items).
  private(set) var section: DexSection = .pokemon
  /// Data scope for search + detail fetches.
  private(set) var format: Format
  /// The raw search field text (may lag the last-fired query by the debounce).
  var query: String = "" {
    didSet {
      guard oldValue != query else { return }
      scheduleSearch()
    }
  }
  /// Latest matches for the current section/format/query.
  private(set) var matches: [SearchMatch] = []
  /// True while a search request is in flight (first paint / section switch).
  private(set) var isLoading = false
  /// Entity route queued by an artifact hop (DEX-US-2). Written after format.
  private(set) var pendingRoute: DexEntityRoute?

  private let dexLookup: any DexLookupService
  private var searchTask: Task<Void, Never>?
  private var generation = 0

  /// Debounce for typed queries — blank-query browse still uses the same path
  /// after section/format changes (scheduled immediately via ``reload()``).
  private static let debounceNanoseconds: UInt64 = 280_000_000

  init(dexLookup: any DexLookupService, format: Format = .champions) {
    self.dexLookup = dexLookup
    self.format = .champions
    _ = format
  }

  /// Initial load (blank browse for the default section). Call once from the view's
  /// `.task` / `onAppear`.
  func start() {
    reload()
  }

  func selectSection(_ next: DexSection) {
    guard next != section else { return }
    section = next
    reload()
  }

  func selectFormat(_ next: Format) {
    // Champions-only Dex: leftover writes must not reopen National Dex / gen-N.
    _ = next
  }

  /// Queues the entity route. Format stays Champions (CF-DEX-US-1).
  func applyArtifactHop(_ hop: DexArtifactHop) {
    format = .champions
    if let section = DexSection(entityKind: hop.kind) {
      self.section = section
    }
    pendingRoute = DexEntityRoute(kind: hop.kind, query: hop.query)
    reload()
  }

  func consumePendingRoute() -> DexEntityRoute? {
    let route = pendingRoute
    pendingRoute = nil
    return route
  }

  /// Cancels any pending debounce and fetches for the current inputs immediately.
  func reload() {
    searchTask?.cancel()
    let kind = section.entityKind
    let q = query
    let fmt = format
    generation += 1
    let gen = generation
    isLoading = true
    searchTask = Task { [dexLookup] in
      let results = await dexLookup.search(kind: kind, query: q, format: fmt)
      guard !Task.isCancelled, gen == generation else { return }
      matches = results
      isLoading = false
    }
  }

  private func scheduleSearch() {
    searchTask?.cancel()
    let kind = section.entityKind
    let q = query
    let fmt = format
    generation += 1
    let gen = generation
    searchTask = Task { [dexLookup] in
      // Debounce only when the user is typing; empty → still wait so rapid clear
      // doesn't thrash, matching team pickers' feel.
      try? await Task.sleep(nanoseconds: Self.debounceNanoseconds)
      guard !Task.isCancelled, gen == generation else { return }
      isLoading = true
      let results = await dexLookup.search(kind: kind, query: q, format: fmt)
      guard !Task.isCancelled, gen == generation else { return }
      matches = results
      isLoading = false
    }
  }
}
