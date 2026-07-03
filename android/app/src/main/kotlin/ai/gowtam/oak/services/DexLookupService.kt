package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.SearchMatch
import android.util.Log
import kotlinx.serialization.Serializable

/**
 * The team-builder entity-picker seam: typeahead search, per-species learnsets, and
 * batch sprite/type/ability/base-stat refs (component-design.md "Services layer";
 * mirrors iOS `DexLookupService`). Backs `TeamEditorViewModel`'s species / ability /
 * item / move pickers so it unit-tests against a fake.
 *
 * All three routes are public, read-only Pokédex reference data (no Bearer header)
 * and **never throw** — a picker that can't reach the index just shows no
 * suggestions / no sprite rather than breaking the editor ([ArtifactService]'s same
 * never-throw policy).
 */
interface DexLookupService {
    /**
     * `GET /api/search` — ranked typeahead candidates for one entity [kind] in
     * [format]. A blank [query] returns an alphabetical browse listing (mirrors the
     * route's blank-query behavior); any fault folds to `[]`.
     */
    suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch>

    /**
     * `GET /api/learnset` — the legal movepool for [pokemon] in [format], sorted by
     * display name. An unknown species or any fault folds to `[]`.
     */
    suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove>

    /**
     * `GET /api/sprites` — batch sprite/type/ability/base-stat refs for [names]
     * (species slugs) in [format], keyed by the requested name. Unknown names are
     * simply absent; any fault folds to `{}`. An empty [names] short-circuits to `{}`
     * with no request.
     */
    suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef>
}

/**
 * Production [DexLookupService] over [OakApiClient]. Every method catches the
 * [OakError] the client throws and maps it to the documented empty result, logging
 * only a non-sensitive label (never the query text).
 */
class LiveDexLookupService(private val apiClient: OakApiClient) : DexLookupService {

    override suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch> {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/search",
            queryItems = listOf(
                "kind" to kind.wireValue,
                "q" to query,
                "format" to format.rawValue,
            ),
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, SearchEnvelope.serializer()).matches
        } catch (e: OakError) {
            Log.e(TAG, "entity search unavailable (kind ${kind.wireValue}): ${e::class.simpleName}")
            emptyList()
        }
    }

    override suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove> {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/learnset",
            queryItems = listOf(
                "pokemon" to pokemon,
                "format" to format.rawValue,
            ),
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, LearnsetEnvelope.serializer()).moves
        } catch (e: OakError) {
            Log.e(TAG, "learnset unavailable: ${e::class.simpleName}")
            emptyList()
        }
    }

    override suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef> {
        if (names.isEmpty()) return emptyMap()
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/sprites",
            queryItems = listOf(
                "format" to format.rawValue,
                "names" to names.joinToString(","),
            ),
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, SpritesEnvelope.serializer()).refs
        } catch (e: OakError) {
            Log.e(TAG, "sprite batch unavailable: ${e::class.simpleName}")
            emptyMap()
        }
    }

    private companion object {
        const val TAG = "Oak.DexLookup"
    }
}

/** `GET /api/search` → `{ matches: SearchMatch[] }`. */
@Serializable
private data class SearchEnvelope(val matches: List<SearchMatch>)

/** `GET /api/learnset` → `{ moves: LearnsetMove[] }`. */
@Serializable
private data class LearnsetEnvelope(val moves: List<LearnsetMove>)

/** `GET /api/sprites` → `{ refs: { [name]: DexSpriteRef } }`. */
@Serializable
private data class SpritesEnvelope(val refs: Map<String, DexSpriteRef>)

/**
 * A never-fetching [DexLookupService]: every call resolves to an empty result with no
 * network access. A default for call sites that only exercise team CRUD and don't
 * care about pickers; production wiring ([ai.gowtam.oak.app.ServiceContainer]) always
 * passes [LiveDexLookupService] explicitly.
 */
class EmptyDexLookupService : DexLookupService {
    override suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch> = emptyList()
    override suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove> = emptyList()
    override suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef> = emptyMap()
}
