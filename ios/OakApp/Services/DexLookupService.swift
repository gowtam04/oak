import Foundation

/// The team-builder entity-picker seam: typeahead search, per-species learnsets, and
/// batch sprite/type/ability/base-stat refs (component-design.md "Services layer"). Backs
/// ``TeamEditorViewModel``'s species / ability / item / move pickers so it unit-tests
/// against a fake, never the `Live…` concrete.
///
/// All three routes are public, read-only Pokédex reference data (no Bearer header) and
/// **never throw** — mirroring the web client helpers (`search-client.ts` /
/// `learnset-client.ts` / `sprites-client.ts`, all of which fold a transport/HTTP/decode
/// fault to an empty result rather than surfacing an error). A picker that can't reach the
/// index just shows no suggestions / no sprite rather than breaking the editor
/// (`ArtifactService`'s same never-throw policy, ADR-8).
protocol DexLookupService: Sendable {
  /// `GET /api/search` — ranked typeahead candidates for one entity `kind` in `format`. A
  /// blank `query` returns an alphabetical browse listing (mirrors the route's blank-query
  /// behavior); any fault folds to `[]`.
  func search(kind: EntityKind, query: String, format: Format) async -> [SearchMatch]

  /// `GET /api/learnset` — the legal movepool for `pokemon` in `format`, sorted by display
  /// name. An unknown species or any fault folds to `[]`.
  func learnset(pokemon: String, format: Format) async -> [LearnsetMove]

  /// `GET /api/sprites` — batch sprite/type/ability/base-stat refs for `names` (species
  /// slugs) in `format`, keyed by the requested name. Unknown names are simply absent;
  /// any fault folds to `[:]`. An empty `names` short-circuits to `[:]` with no request.
  func sprites(names: [String], format: Format) async -> [String: DexSpriteRef]
}

// MARK: - Live implementation

/// Production ``DexLookupService`` over ``OakAPIClient``. A value type holding one
/// immutable actor reference, so it is `Sendable` without ceremony. Every method catches
/// the ``OakError`` the client throws and maps it to the documented empty result, logging
/// only a non-sensitive label (never the query text — conventions.md "Logging").
struct LiveDexLookupService: DexLookupService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func search(kind: EntityKind, query: String, format: Format) async -> [SearchMatch] {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/search",
      queryItems: [
        URLQueryItem(name: "kind", value: kind.rawValue),
        URLQueryItem(name: "q", value: query),
        URLQueryItem(name: "format", value: format.rawValue),
      ],
      requiresAuth: false
    )
    do {
      return try await apiClient.send(endpoint, as: SearchEnvelope.self).matches
    } catch {
      Log.network.error("entity search unavailable (kind \(kind.rawValue, privacy: .public))")
      return []
    }
  }

  func learnset(pokemon: String, format: Format) async -> [LearnsetMove] {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/learnset",
      queryItems: [
        URLQueryItem(name: "pokemon", value: pokemon),
        URLQueryItem(name: "format", value: format.rawValue),
      ],
      requiresAuth: false
    )
    do {
      return try await apiClient.send(endpoint, as: LearnsetEnvelope.self).moves
    } catch {
      Log.network.error("learnset unavailable")
      return []
    }
  }

  func sprites(names: [String], format: Format) async -> [String: DexSpriteRef] {
    guard !names.isEmpty else { return [:] }
    let endpoint = Endpoint(
      method: .get,
      path: "/api/sprites",
      queryItems: [
        URLQueryItem(name: "format", value: format.rawValue),
        URLQueryItem(name: "names", value: names.joined(separator: ",")),
      ],
      requiresAuth: false
    )
    do {
      return try await apiClient.send(endpoint, as: SpritesEnvelope.self).refs
    } catch {
      Log.network.error("sprite batch unavailable")
      return [:]
    }
  }
}

// MARK: - Wire envelopes (private to the service)

/// `GET /api/search` → `{ matches: SearchMatch[] }`.
private struct SearchEnvelope: Decodable, Sendable {
  let matches: [SearchMatch]
}

/// `GET /api/learnset` → `{ moves: LearnsetMove[] }`.
private struct LearnsetEnvelope: Decodable, Sendable {
  let moves: [LearnsetMove]
}

/// `GET /api/sprites` → `{ refs: { [name]: DexSpriteRef } }`.
private struct SpritesEnvelope: Decodable, Sendable {
  let refs: [String: DexSpriteRef]
}

// MARK: - Null object (default for call sites that don't need dex data)

/// A never-fetching ``DexLookupService``: every call resolves to an empty result with no
/// network access. This is ``TeamEditorViewModel``/``TeamsListViewModel``'s default
/// argument, so the many existing call sites that only exercise team CRUD (and don't care
/// about pickers) keep compiling unchanged; production wiring (``ServiceContainer``)
/// always passes ``LiveDexLookupService`` explicitly.
struct EmptyDexLookupService: DexLookupService {
  func search(kind: EntityKind, query: String, format: Format) async -> [SearchMatch] { [] }
  func learnset(pokemon: String, format: Format) async -> [LearnsetMove] { [] }
  func sprites(names: [String], format: Format) async -> [String: DexSpriteRef] { [:] }
}
