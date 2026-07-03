package ai.gowtam.oak.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Team-builder dex-lookup wire DTOs — read-only enrichment for the entity
 * pickers (species/ability/item/move search, learnset filtering, batch
 * sprites). Faithful mirrors of the three public GET routes:
 *  - `GET /api/search` → `{ matches: SearchMatch[] }`.
 *  - `GET /api/learnset` → `{ moves: LearnsetMove[] }`.
 *  - `GET /api/sprites` → `{ refs: { [name]: DexSpriteRef } }`.
 *
 * All three routes are public (no auth) and never throw for an in-domain miss —
 * an unreadable index degrades to an empty list/map on a 200; the client
 * services (P4) mirror that by folding every transport/decode fault to the same
 * empty result rather than throwing.
 */

/** One typeahead candidate from `GET /api/search` — mirrors `SearchMatch`. */
@Serializable
data class SearchMatch(
    val slug: String,
    @SerialName("display_name") val displayName: String,
    val kind: EntityKind,
)

/**
 * One legal move for a species' movepool from `GET /api/learnset` — mirrors
 * `LearnsetOption`. `type`/`damageClass`/`power` are F1 metadata the moves
 * table renders alongside each picker; they ride along only when the move has
 * cached reference detail, so all three are optional.
 */
@Serializable
data class LearnsetMove(
    val slug: String,
    @SerialName("display_name") val displayName: String,
    val type: String? = null,
    @SerialName("damage_class") val damageClass: DamageClass? = null,
    val power: Int? = null,
) {
    /** The three move damage classes — mirrors `MoveDamageClass`. */
    @Serializable
    enum class DamageClass {
        @SerialName("physical") PHYSICAL,
        @SerialName("special") SPECIAL,
        @SerialName("status") STATUS,
    }
}

/**
 * Batch sprite/type/ability/base-stat ref for one species from
 * `GET /api/sprites` — mirrors `SpriteRef` (`web/src/data/repos/pokedex-repo.ts`).
 * [requiredItem] is the Mega-stone slug the team builder auto-forces onto the
 * held-item field; [abilities] is the form's legal ability slugs (the Ability
 * picker's ONLY offered options). Both are optional so older cached responses
 * without the columns still decode.
 */
@Serializable
data class DexSpriteRef(
    @SerialName("display_name") val displayName: String,
    @SerialName("sprite_url") val spriteUrl: String,
    @SerialName("dex_number") val dexNumber: Int,
    val types: List<String>,
    @SerialName("required_item") val requiredItem: String? = null,
    val abilities: List<String>? = null,
    /** Reuses [BaseStats] — the sprite batch route's `base_stats` is structurally identical. */
    @SerialName("base_stats") val baseStats: BaseStats,
)
