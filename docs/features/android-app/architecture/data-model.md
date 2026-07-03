# Data Model (Android)

The Android app owns **no business data** — the backend (Postgres) is the single source
of truth. The client's "data model" is three things: (1) **`@Serializable` DTOs** in the
`wire` package that mirror the wire contracts, (2) four **ported pure functions** (the
team-patch logic), and (3) a small amount of **on-device state**. No backend schema
touchpoints — account deletion and Bearer auth already shipped.

> **Fidelity rule.** The Kotlin DTOs are a faithful mirror of the TypeScript/Zod
> contracts (authoritative) and of the iOS Swift mirrors (`ios/OakApp/Models/Wire/`,
> the class-for-class port target). A round-trip decode test over committed real-response
> fixtures (P1) guards drift. **Field names use explicit `@SerialName` per renamed field —
> never a global `JsonNamingStrategy`** (the payloads mix `snake_case` and `camelCase`;
> DADR-10). The `Json` instance is configured `ignoreUnknownKeys = true`,
> `explicitNulls = false` for decode tolerance, but **`explicitNulls = true` is required
> when encoding `TeamMember`** (see below).

All DTOs live under `ai.gowtam.oak.wire` (package-private to no one — this is the
would-be shared module if a KMP client ever happens; it imports nothing android-specific).

## A. Wire DTOs

### Chat request — `POST /api/chat` body (mirrors `sse-types.ts` `ChatRequestBody`)

```kotlin
@Serializable
data class ChatRequest(
  @SerialName("session_id") val sessionId: String,   // client UUID; == conversationId on resume
  val message: String,                                // 0–2000 chars; may be "" iff images present
  val images: List<ChatImage>? = null,                // ≤ 4; null ⇒ text-only turn
  @SerialName("scope_seed") val scopeSeed: Format? = null,  // header scope-chip pick
)

@Serializable
data class ChatImage(
  val mimeType: String,   // best-effort; server re-sniffs magic bytes. Intentionally camelCase — do NOT remap.
  val data: String,       // RAW base64, no "data:" prefix
)
```
> **No `champions_mode`, no `active_team_id`.** The deprecated `champions_mode` boolean is
> a server-side no-op below the sticky scope and champions is the default, so Android never
> sends it (parity with iOS `ChatWire.swift`). Saved teams are referenced **by name in
> chat** (agent calls `list_teams`/`get_team`), so there is no team id on the body.

### SSE events — chat stream (mirrors `SseEventName` in `sse-types.ts`)

```kotlin
sealed interface SseEvent {
  data class Scope(val format: Format, val source: ScopeSource) : SseEvent   // "scope" — first, exactly one
  data class ToolActivity(val tool: String, val label: String) : SseEvent    // "tool_activity"
  data object AnswerStart : SseEvent                                          // "answer_start" — reset buffer
  data class AnswerDelta(val text: String) : SseEvent                        // "answer_delta"
  data class Answer(val answer: OakAnswer) : SseEvent                        // "answer" — terminal, authoritative
  data class Error(val code: String, val message: String, val status: Int?) : SseEvent  // "error" — transport faults ONLY
}
```
The `: keep-alive` comment (every 15s) is ignored by the parser. Emission order:
`scope` (once, first) → `tool_activity`* → `answer_start`*/`answer_delta`* → exactly one
terminal `answer`. **Every in-domain failure rides a normal `answer` event** whose
`OakAnswer.status` carries it — `Error` is reserved for model/API transport faults.

`ScopeSource` decodes tolerantly (server may add resolution sources):
```kotlin
sealed interface ScopeSource {
  data object Message : ScopeSource; data object Conversation : ScopeSource
  data object Seed : ScopeSource; data object Default : ScopeSource
  data class Unknown(val raw: String) : ScopeSource
}
```
The `Scope`/`ToolActivity`/`AnswerDelta`/`Answer`/`Error` events are decoded from each
frame's `data:` JSON by the `SseParser` (see `component-design.md`); the parser maps the
bare `answer_start` name straight to `AnswerStart` (its frame is `{}`).

### OakAnswer — mirrors `oakAnswerSchema` in `schemas.ts` (field-by-field render target)

```kotlin
@Serializable
data class OakAnswer(
  val status: Status,
  @SerialName("answer_markdown") val answerMarkdown: String,
  @SerialName("reasoning_markdown") val reasoningMarkdown: String,
  val citations: List<Citation>,
  val inferences: List<Inference>,
  @SerialName("generation_basis") val generationBasis: GenerationBasis,
  // optional, render-if-present:
  val subjects: List<Subject>? = null,
  val candidates: Candidates? = null,
  @SerialName("damage_calc") val damageCalc: DamageCalc? = null,
  val suggestions: List<String>? = null,
  val question: ClarifyQuestion? = null,
  @SerialName("uncertainty_flags") val uncertaintyFlags: List<String>? = null,
  // team-builder (server-stamped):
  @SerialName("proposed_team") val proposedTeam: ProposedTeam? = null,
  @SerialName("saved_team") val savedTeam: SavedTeamRef? = null,
  @SerialName("proposed_team_warnings") val proposedTeamWarnings: List<TeamWarning>? = null,
) {
  @Serializable enum class Status {
    @SerialName("answered") ANSWERED,
    @SerialName("clarification_needed") CLARIFICATION_NEEDED,
    @SerialName("resolution_failed") RESOLUTION_FAILED,
    @SerialName("insufficient_data") INSUFFICIENT_DATA,
  }
}
```

Sub-objects (exact `@SerialName` mapping, source = `schemas.ts`):

| Kotlin type | Fields → wire keys |
|---|---|
| `Citation` | `source`, `detail`, `endpointUrl` → `endpoint_url` (nullable) |
| `Inference` | `claim`, `confidence` (`high`/`medium`/`low`), `note?` |
| `GenerationBasis` | `generation`, `fallback`, `note?` |
| `Subject` | `name`, `dexNumber` → `dex_number` (nullable), `spriteUrl` → `sprite_url`, `types`, `isFallback` → `is_fallback`, `sourceGeneration` → `source_generation` (nullable) |
| `Candidates` | `totalCount` → `total_count`, `truncated`, `sort?`, `shown: List<CandidateRow>` |
| `CandidateRow` | `name`, `dexNumber` → `dex_number`, `spriteUrl` → `sprite_url` (nullable), `types`, `baseStats` → `base_stats` (nullable), `keyStats` → `key_stats` (`Map<String, JsonScalar>?`), `ability?` |
| `BaseStats` | `hp`, `atk` → `attack`, `def` → `defense`, `spa` → `special_attack`, `spd` → `special_defense`, `spe` → `speed` |
| `DamageCalc` | `assumptions` (`Map<String, JsonScalar>`), `result` (`Map<String, JsonScalar>`), `isEstimate` → `is_estimate` (always `true`), `breakdown?` |
| `ClarifyQuestion` | `options: List<ClarifyOption>` |
| `ClarifyOption` | `label` (sent verbatim as next message when tapped), `description?` |
| `ProposedTeam` | `name`, `format: Format`, `members: List<TeamMember>` |
| `SavedTeamRef` | `id`, `name`, `format: Format` |

> **`BaseStats` gotcha:** the answer/entity/sprite `base_stats` use **full** stat-name keys
> (`attack`/`defense`/`special_attack`/…), whereas the team `StatSpread` uses the
> **abbreviated** keys (`atk`/`def`/`spa`/…). They are two different DTOs — do not share one.

### JsonScalar — free-form scalar (mirrors `jsonScalarSchema`)

`key_stats` / `assumptions` / `result` are `Record<string, string | number | boolean | null>`.
Model as a sealed class that round-trips without loss; **integers stay integers** (`5` → `5`,
not `5.0`):
```kotlin
@Serializable(with = JsonScalarSerializer::class)
sealed interface JsonScalar {
  data class Str(val v: String) : JsonScalar
  data class IntVal(val v: Long) : JsonScalar
  data class DoubleVal(val v: Double) : JsonScalar
  data class BoolVal(val v: Boolean) : JsonScalar
  data object Null : JsonScalar
}
```
The custom serializer decodes bool-before-number and int-before-double (mirrors iOS
`JSONScalar`), so `true` never coerces to `1` and whole numbers keep integer form.

### Format — the data-scope discriminator (mirrors `formats.ts` `FORMATS`; tolerant)

```kotlin
@Serializable(with = FormatSerializer::class)
sealed interface Format {
  data object ScarletViolet : Format   // "scarlet-violet"  (Gen 9 / standard)
  data object Champions : Format       // "champions"
  data object Gen5 : Format; data object Gen6 : Format; data object Gen7 : Format; data object Gen8 : Format
  data class Unknown(val raw: String) : Format   // any string outside the known six
}
```
- `rawValue`: `scarlet-violet` / `champions` / `gen-5` … `gen-8` / `raw`.
- `knownCases` = `[ScarletViolet, Champions, Gen5, Gen6, Gen7, Gen8]` — backs the six-way
  scope chip/filter (`Unknown` excluded — no fixed identity to list).
- `shortLabel` (mirrors `scopeLabelShort`): `Champions`, `Gen 9`, `Gen 8`, `Gen 7`, `Gen 6`,
  `Gen 5`; `Unknown` echoes its raw string.
- `displayLabel` (mirrors `scopeLabel`): `Champions · Reg M-B`, `Gen 9 · Scarlet/Violet`,
  `Gen 8 · Sword/Shield`, `Gen 7 · USUM`, `Gen 6 · XY/ORAS`, `Gen 5 · Black/White`. The
  Champions regulation string (`Regulation M-B`, from `CHAMPIONS_REGULATION`) is duplicated
  here — update it when the regulation rotates.
- **Tolerant decoding is load-bearing:** a web-created conversation/team in a format this
  app build doesn't know (`gen-5`…`gen-8` postdate the original 2-case Format; more may be
  added) degrades to `Unknown(raw)` so a single unrecognized `format` never fails the parent
  object's decode (`ConversationSummary`/`ConversationDetail`/`Team`/`EntityArtifactOk`/…).

### Team model — mirrors `team-schema.ts`

```kotlin
@Serializable
data class StatSpread(val hp: Int, val atk: Int, val def: Int, val spa: Int, val spd: Int, val spe: Int)
// Raw 0..255 per stat on the wire (Showdown byte range). Legality (≤252/stat, ≤508 total,
// IV 0..31) is warn-only server-side, never enforced by this DTO. Keys match the wire 1:1.

@Serializable
data class TeamMember(
  val species: String?,          // slug; null = empty slot
  val ability: String?,          // slug; null = not set
  val item: String?,             // slug; null = none
  val moves: List<String>,       // 0..4
  val nature: String?,           // slug; null = not set
  val evs: StatSpread,
  val ivs: StatSpread,
  @SerialName("tera_type") val teraType: String?,   // null = not set
  val level: Int,                // 1..100; default 50
  val nickname: String? = null,  // cosmetic (optional key — may be absent)
  val gender: Gender? = null,    // cosmetic
  val shiny: Boolean? = null,    // cosmetic
) {
  @Serializable enum class Gender { @SerialName("M") MALE, @SerialName("F") FEMALE, @SerialName("N") NEUTRAL }
}
```
> **Encoding nuance (why `explicitNulls = true` when sending a team).** In Zod, `species`,
> `ability`, `item`, `nature`, `tera_type` are **`.nullable()` (required key, value may be
> `null`)** — the server's `.strict()` parse **rejects an absent key**. `nickname`/`gender`/
> `shiny` are **`.optional()` (key may be absent)**. So a `TeamMember` sent to the server
> must emit `"item": null` (not omit it) for the five nullable-required fields while omitting
> the three absent-optional cosmetics. In kotlinx.serialization this means encoding
> `TeamMember` with a `Json { explicitNulls = true }` instance **and** giving the three
> cosmetics `= null` defaults with `@EncodeDefault(NEVER)` — OR a hand-written serializer
> that mirrors iOS's custom `encode(to:)` exactly. Decoding tolerates both null and absent.

```kotlin
@Serializable
data class TeamWarning(
  val code: Code,
  val message: String,
  val slot: Int? = null,   // 0..5; absent ⇒ team-level
  val field: String? = null,  // e.g. "evs.atk", "moves[2]", "ability"
) {
  @Serializable enum class Code {
    @SerialName("incomplete") INCOMPLETE,
    @SerialName("ev_total_exceeded") EV_TOTAL_EXCEEDED,
    @SerialName("ev_stat_exceeded") EV_STAT_EXCEEDED,
    @SerialName("iv_out_of_range") IV_OUT_OF_RANGE,
    @SerialName("species_illegal") SPECIES_ILLEGAL,
    @SerialName("ability_not_for_species") ABILITY_NOT_FOR_SPECIES,
    @SerialName("item_illegal") ITEM_ILLEGAL,
    @SerialName("item_missing") ITEM_MISSING,      // ⚠ see drift note
    @SerialName("move_not_in_learnset") MOVE_NOT_IN_LEARNSET,
    @SerialName("duplicate_species") DUPLICATE_SPECIES,
    @SerialName("duplicate_item") DUPLICATE_ITEM,
  }
}
```
> **⚠ Drift found (report, don't silently resolve).** The web `warningCodeSchema` has **11**
> codes including **`item_missing`**; the iOS `TeamWarning.Code` (`ios/…/Team.swift`) has
> only **10** and is **missing `item_missing`** — so an `item_missing` warning would throw on
> iOS decode. Android **includes all 11** and additionally makes the enum tolerant (unknown
> code → an `Unknown` fallback via a custom serializer, or `@JsonNames`/coerce) so a future
> warning code can never fail a team decode. The web `HARD_VIOLATION_CODES` set
> (species_illegal, ability_not_for_species, item_illegal, move_not_in_learnset,
> duplicate_species, duplicate_item — note `item_missing` and the EV/IV/incomplete codes are
> **not** hard) informs which warnings block *nothing* but should read as more severe.

`validation` is a **flat `List<TeamWarning>`** on the wire (the route returns
`{ team, validation }`, `validation: TeamWarning[]`). Model it directly as
`List<TeamWarning>`; a `TeamValidationResult(warnings)` wrapper is optional sugar (iOS wraps
it via a single-value container — Kotlin can just use the list).

### Teams-assistant DTOs — mirrors `teams-assistant-sse-types.ts` + `teams-assistant/schemas.ts`

A deliberate **sibling** of the chat wire: the terminal `answer` carries a `BuilderAnswer`
(prose + optional `TeamPatch`), never an `OakAnswer`, and there is **no `scope` event**
(`draft.format` is the turn's scope).

```kotlin
@Serializable
data class TeamsAssistantDraft(val name: String, val format: Format, val members: List<TeamMember>)

@Serializable
data class TeamsAssistantRequest(
  @SerialName("session_id") val sessionId: String,   // per-editor id; in-memory history only
  val message: String,
  val draft: TeamsAssistantDraft,                     // sent with EVERY turn; draft.format IS the scope
)

@Serializable
data class TeamPatchSlot(val slot: Int, val member: TeamMember?)  // member null = remove; slot = PRE-patch index

@Serializable
data class TeamPatch(val name: String? = null, val slots: List<TeamPatchSlot>)  // name null/absent = unchanged

@Serializable
data class BuilderAnswer(
  @SerialName("answer_markdown") val answerMarkdown: String,
  @SerialName("team_patch") val teamPatch: TeamPatch? = null,   // absent/null = advice-only turn
)

sealed interface BuilderSseEvent {   // chat event order MINUS `scope`
  data class ToolActivity(val tool: String, val label: String) : BuilderSseEvent
  data object AnswerStart : BuilderSseEvent
  data class AnswerDelta(val text: String) : BuilderSseEvent
  data class Answer(val answer: BuilderAnswer) : BuilderSseEvent
  data class Error(val code: String, val message: String, val status: Int?) : BuilderSseEvent
}
```

### Response envelopes — auth / conversations / teams / entity / dex-lookup

> **camelCase alert.** The auth and conversation/team envelopes are already **camelCase on
> the wire** (`json()` `JSON.stringify`s repo objects verbatim — it does NOT snake-case).
> These map with identity `@SerialName` and never a snake-case strategy.

```kotlin
@Serializable
data class AuthVerifyResponse(
  val ok: Boolean, val email: String, val created: Boolean,
  val token: String,          // the Bearer token → Keystore
  val expiresAt: Long,        // epoch-ms expiry of the 30-day window (camelCase)
)
@Serializable data class MeResponse(val signedIn: Boolean, val email: String? = null)  // camelCase; guest ⇒ no email
@Serializable data class ApiErrorBody(val code: String, val message: String, val status: Int? = null)  // status not in body

@Serializable
data class ConversationSummary(   // GET /api/conversations → { conversations: [...] }
  val id: String, val title: String, val format: Format, val pinned: Boolean,
  val updatedAt: Long,            // camelCase epoch-ms. NOTE: NO createdAt on the list projection.
)
@Serializable
data class ConversationDetail(    // GET /api/conversations/{id}
  val id: String, val title: String, val format: Format, val pinned: Boolean,
  val turns: List<ChatTurn>,
)
sealed interface ChatTurn {       // discriminated on "role"
  data class User(val id: String, val content: String) : ChatTurn
  data class Assistant(val id: String, val answer: OakAnswer) : ChatTurn
}
@Serializable
data class Team(                  // { team } envelope; camelCase timestamps
  val id: String, val name: String, val format: Format, val members: List<TeamMember>,
  val createdAt: Long, val updatedAt: Long,   // the wire also carries accountId — intentionally not decoded
)
@Serializable
data class TeamSummary(           // GET /api/teams → { teams: [...] } (repo projection, NOT full Team)
  val id: String, val name: String, val format: Format,
  val memberCount: Int, val incomplete: Boolean, val species: List<String>, val updatedAt: Long,
)
@Serializable
data class ImportNote(            // POST /api/teams/import → { notes: [...] }
  val slot: Int, val kind: Kind, val raw: String,
  val resolvedTo: String? = null, val message: String,  // camelCase on the wire (flat JSON.stringify envelope)
) { @Serializable enum class Kind { pokemon, move, ability, item, nature, tera, level } }
// Verified vs web/src/server/teams/import-export.ts: 7 kinds (incl. "level"), resolvedTo NOT snake_cased.
```

`ChatTurn` decodes with a custom serializer that switches on the `role` key (`user` →
`content`, `assistant` → `answer: OakAnswer`), mirroring iOS's hand-written init.

### EntityArtifact — `GET /api/entity` (mirrors `entity-artifact.ts` / `schemas.ts`)

A discriminated union on `status`, the `ok` arm further discriminated on `kind`:
```kotlin
sealed interface EntityArtifact {
  data class Ok(val v: EntityArtifactOk) : EntityArtifact          // status: "ok"
  data class NotFound(val v: EntityArtifactNotFound) : EntityArtifact  // status: "not_found"
  data class Unavailable(val v: EntityArtifactUnavailable) : EntityArtifact  // status: "unavailable"
}
enum class EntityKind { pokemon, move, ability, item, type }   // ENTITY_KINDS
```
`EntityArtifactOk`: `kind`, `format`, `resolved { slug, displayName→display_name }`,
`generation`, `isFallback→is_fallback`, `fallbackNote→fallback_note?`, `citations`, and a
`kind`-selected `data`:
- **pokemon** (`PokemonArtifactData`): `displayName→display_name`, `nationalDexNumber→national_dex_number`,
  `types`, `abilities { slot1, slot2?, hidden? }`, `baseStats→base_stats` (full-name keys),
  `baseStatTotal→base_stat_total`, `spriteUrl→sprite_url`, `artworkUrl→artwork_url`, `forms`,
  `isGen9Native→is_gen9_native`, `sourceGeneration→source_generation?`,
  `matchups: DefensiveProfile`, `movepool: List<MovepoolGroup>`.
- **move** (`MoveArtifactData`): `displayName`, `type`, `damageClass→damage_class`
  (physical/special/status), `power?`, `accuracy?`, `pp?`, `priority`, `target`,
  `hitsAllies→hits_allies?`, `spreadModifierDoubles→spread_modifier_doubles?` (Double),
  `effectShort→effect_short`, `effectFull→effect_full`, `gen9LearnerCount→gen9_learner_count?`.
- **ability** (`AbilityArtifactData`): `displayName`, `effectShort`, `effectFull`,
  `learnedBy→learned_by: List<AbilityHolder { slug, displayName }>`.
- **item** (`ItemArtifactData`): `displayName`, `effectShort`, `effectFull`,
  `heldByWild→held_by_wild?: List<WildItemHolder { pokemon, rarityPercent→rarity_percent (Double) }>`.
- **type** (`TypeArtifactData`): `types`, `offensive?: OffensiveProfile`, `defensive: DefensiveProfile`.

`DefensiveProfile`: `weakTo→weak_to`, `resists`, `immuneTo→immune_to`,
`quadWeakTo→quad_weak_to?`, `quadResists→quad_resists?`. `OffensiveProfile`:
`superEffectiveAgainst→super_effective_against`, `notVeryEffectiveAgainst→not_very_effective_against`,
`noEffectAgainst→no_effect_against`. `MovepoolGroup { method, moves: List<MovepoolMove> }`;
`MovepoolMove { slug, displayName→display_name, type }`.

`EntityArtifactNotFound { kind, format, query, suggestions }`;
`EntityArtifactUnavailable { kind, format }`. All three arms are 200s — misses are honest
in-domain values the viewer renders, never thrown (`ArtifactService` returns `null`).

### Dex-lookup DTOs — `GET /api/search` / `/api/learnset` / `/api/sprites`

```kotlin
@Serializable data class SearchMatch(val slug: String, @SerialName("display_name") val displayName: String, val kind: EntityKind)
@Serializable data class LearnsetMove(
  val slug: String, @SerialName("display_name") val displayName: String,
  val type: String? = null, @SerialName("damage_class") val damageClass: DamageClass? = null, val power: Int? = null,
) { enum class DamageClass { physical, special, status } }
@Serializable data class DexSpriteRef(   // GET /api/sprites → { refs: { [name]: DexSpriteRef } }
  @SerialName("display_name") val displayName: String, @SerialName("sprite_url") val spriteUrl: String,
  @SerialName("dex_number") val dexNumber: Int, val types: List<String>,
  @SerialName("required_item") val requiredItem: String? = null,   // Mega-stone slug the editor auto-forces
  val abilities: List<String>? = null,                             // form's legal ability slugs (Ability picker options)
  @SerialName("base_stats") val baseStats: BaseStats,
)
```
All three routes are public (no auth) and fold every miss/fault to an empty list/map on a
200 — `DexLookupService` mirrors that by never throwing.

## B. Ported pure functions (the four team-patch functions — DADR-12)

Ported **verbatim** from `web/src/agent/teams-assistant/schemas.ts` (and
`display-names.ts`) into `ai.gowtam.oak.wire`, parity-tested against shared vectors so the
client-applied result equals the server-validated one:

```kotlin
fun blankTeamMember(): TeamMember = TeamMember(
  species = null, ability = null, item = null, moves = emptyList(), nature = null,
  evs = StatSpread(0, 0, 0, 0, 0, 0),
  ivs = StatSpread(31, 31, 31, 31, 31, 31),
  teraType = null, level = 50, nickname = null, gender = null, shiny = null,
)

// Slot indices refer to the PRE-patch draft. Replace/extend-with-blank-padding first,
// then null-remove, then compact and cap at 6. Pure — returns a new list.
fun applyTeamPatch(members: List<TeamMember>, patch: TeamPatch): List<TeamMember> {
  val next = members.toMutableList<TeamMember?>()
  val removals = mutableListOf<TeamPatchSlot>()
  for (op in patch.slots) {
    if (op.member == null) { removals.add(op); continue }
    while (next.size <= op.slot) next.add(blankTeamMember())
    next[op.slot] = op.member
  }
  for (op in removals) if (op.slot < next.size) next[op.slot] = null
  return next.filterNotNull().take(6)
}

// Mirrors describePatch in TeamsAssistantPanel.tsx: curly quotes, em-dash (—), middot (·).
fun describeTeamPatch(patch: TeamPatch): List<String> { /* rename line + per-slot "Slot N: …" lines */ }

// "great-tusk" → "Great Tusk"; splits on '-' and whitespace, title-cases each word.
fun titleizeTeamSlug(value: String): String
```
See `ios/OakApp/Models/Wire/TeamsAssistantWire.swift` for the reference `describeTeamPatch`
line format (each op: `Slot N: <Species> — <ability> · <item> · <move / move> · <nature> nature`).

## C. On-device state (no durable business cache — online-only)

| State | Store | Notes |
|---|---|---|
| Session token | **Keystore** via `EncryptedSharedPreferences` (`AES256_GCM`), file `oak_secure_prefs`, key `session_token` | Written on `verify`, read on every authed request, deleted on signout/deletion. Keystore master key. |
| Signed-in email (display) | `EncryptedSharedPreferences` or `DataStore` | Convenience for the account screen; cleared with the token. |
| Champions/scope default | `SharedPreferences`/`DataStore` | Fresh conversation defaults to champions; per-conversation scope derives from `format` on resume. |
| Current guest session id | in-memory (`AppState`) / `DataStore` | Client UUID for the active guest thread; rotated on new-conversation/signout. |
| Guest thread turns + scope | **in-memory only** (`AppState`) | Never persisted; the guest→sign-in `import` payload. Mirrors web/iOS guest behavior. |
| Model / active scope | n/a | Model is operator-controlled server-side; not stored or exposed. |

No Room/SQLite/on-disk conversation or team cache in v1. History and teams are always
fetched live; offline shows a connection state. (Coil's default disk/memory cache for
sprite images is fine — that's asset caching, not business data.)

## ERD

The client holds no relational data. Client-side, the only "relationship" is
reference-by-id over the wire: `ChatRequest.sessionId == Conversation.id` on resume,
resolved by the backend. There is **no** `activeTeamId` link (removed product-wide).
</content>
