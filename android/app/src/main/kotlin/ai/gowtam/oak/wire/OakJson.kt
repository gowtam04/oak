package ai.gowtam.oak.wire

import kotlinx.serialization.json.Json

/**
 * The single shared `Json` configuration for wire decode/encode (conventions.md
 * "Serialization"). Tolerant on decode: `ignoreUnknownKeys` (the wire can add
 * fields ahead of a client release) and `explicitNulls = false` (an absent
 * optional key decodes the same as an explicit `null`).
 *
 * [TeamMember]'s asymmetric encode semantics (five `.nullable()`-required keys
 * always emitted, three `.optional()` cosmetics omitted when absent — see
 * `TeamMemberSerializer` in `Team.kt`) are handled by that type's own
 * `KSerializer`, not by this instance's flags, so ONE `Json` config is safe to
 * use for both encoding requests and decoding responses. Never set a
 * `JsonNamingStrategy` here — the wire mixes `snake_case` and `camelCase`
 * (DADR-10); every renamed field carries an explicit `@SerialName` instead.
 */
val OakJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}
