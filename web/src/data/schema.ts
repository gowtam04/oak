/**
 * Drizzle ORM table definitions for Oak's Postgres store.
 *
 * The five Pokédex-index tables (design.md § Data Model) each carry a `format`
 * discriminator ("scarlet-violet" | "champions") so one physical schema holds
 * both the standard Gen-9 index and the Champions index; repos filter by the
 * active format (derived from the turn's mode). See src/data/formats.ts.
 *
 *   pokemon          — DS-2 Pokédex index, one row per (format, battle form)
 *   learnset         — DS-3 learnset index, PK (pokemon_id, move_slug, format)
 *   reference_cache  — DS-4 reference detail (move/ability/type/evo/item), PK
 *                      (format, resource_key); pre-built per format at ingest
 *   searchable_names — backs resolve_entity (T1, BR-9), PK (format, kind, slug)
 *   ingest_meta      — pipeline bookkeeping, one row PER FORMAT
 *
 * Three further tables back the email-OTP auth layer
 * (docs/features/account-creation, § Data Model). Auth is GLOBAL, so unlike the
 * index tables these are NOT format-scoped (no `format` column):
 *
 *   account          — one row per registered user; UNIQUE normalized email
 *   auth_session     — one row per active device session; UNIQUE token_hash
 *   otp_code         — at most one active code per email (upsert by email PK)
 *
 * Postgres type notes (vs. the old SQLite schema):
 *   - `integer` is int4 — fine for dex numbers, stats, counts, and the 0/1
 *     `is_gen9_native` flag.
 *   - `fetched_at` / `last_success_at` hold epoch MILLISECONDS (~1.75e12) which
 *     overflow int4, so they are `bigint` with `mode: "number"` (safe < 2^53).
 *   - `payload` stays TEXT (a JSON string written/read with JSON.stringify/parse).
 *
 * Import only from here — never duplicate column defs elsewhere.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Postgres `tsvector` — the full-text search type. Drizzle pg-core has no
 * built-in column type for it, so it's declared here as a `customType`. Only the
 * wiki full-text search (T19 `search_wiki`, Oak v2 §4.2/§5) uses it; the column
 * is a STORED GENERATED column (see `wiki_chunk.tsv`), so nothing ever writes it
 * directly — Postgres derives it from `section || ' ' || content` on insert.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// pokemon — DS-2 Pokédex index (one row per (format, battle-relevant form), D8)
// ---------------------------------------------------------------------------
export const pokemon = pgTable(
  "pokemon",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** PokeAPI-style pokemon slug, e.g. "tauros-paldea-aqua". */
    id: text("id").notNull(),
    /** e.g. "tauros" */
    species_name: text("species_name").notNull(),
    /** e.g. "paldea-aqua"; null for the base form. */
    form_name: text("form_name"),
    /** Disambiguating human label, e.g. "Tauros (Paldean Aqua)". */
    display_name: text("display_name").notNull(),
    national_dex_number: integer("national_dex_number").notNull(),
    /** One of the 18 canonical type slugs. */
    type1: text("type1").notNull(),
    /** Null for mono-type Pokémon. */
    type2: text("type2"),
    ability_slot1: text("ability_slot1").notNull(),
    ability_slot2: text("ability_slot2"),
    ability_hidden: text("ability_hidden"),
    stat_hp: integer("stat_hp").notNull(),
    stat_attack: integer("stat_attack").notNull(),
    stat_defense: integer("stat_defense").notNull(),
    stat_special_attack: integer("stat_special_attack").notNull(),
    stat_special_defense: integer("stat_special_defense").notNull(),
    stat_speed: integer("stat_speed").notNull(),
    /** Precomputed sum of all six base stats (for BST sort/threshold queries). */
    base_stat_total: integer("base_stat_total").notNull(),
    sprite_url: text("sprite_url").notNull(),
    artwork_url: text("artwork_url").notNull(),
    /**
     * Held item this form is REQUIRED to carry, as a canonical item slug — i.e. a
     * Mega's stone ("swampertite", "charizardite-x"); null for ordinary forms.
     * Lets the team builder auto-select + lock a Mega's stone (@pkmn requiredItem).
     */
    required_item: text("required_item"),
    /** e.g. "gen-9" (standard) / "champions". */
    generation: text("generation").notNull(),
    /**
     * 1 if native to this format's game, 0 if included as an earlier-gen
     * fallback (BR-1). In Champions every indexed row is legal ⇒ always 1.
     */
    is_gen9_native: integer("is_gen9_native").notNull(),
    /** Set when is_gen9_native = 0 (BR-1), e.g. "gen-8"; null otherwise. */
    source_generation: text("source_generation"),
  },
  (t) => [
    // Same national-dex slug exists in both formats → format is part of the PK.
    primaryKey({ columns: [t.format, t.id] }),
    // national dex sort / lookup
    index("pokemon_national_dex_number_idx").on(t.national_dex_number),
    // type filters (US-2)
    index("pokemon_type1_idx").on(t.type1),
    index("pokemon_type2_idx").on(t.type2),
    // individual stat threshold / superlative queries (AC-3.x)
    index("pokemon_stat_hp_idx").on(t.stat_hp),
    index("pokemon_stat_attack_idx").on(t.stat_attack),
    index("pokemon_stat_defense_idx").on(t.stat_defense),
    index("pokemon_stat_special_attack_idx").on(t.stat_special_attack),
    index("pokemon_stat_special_defense_idx").on(t.stat_special_defense),
    index("pokemon_stat_speed_idx").on(t.stat_speed),
    index("pokemon_base_stat_total_idx").on(t.base_stat_total),
  ],
);

// ---------------------------------------------------------------------------
// learnset — DS-3 learnset index (D6, BR-2)
// ---------------------------------------------------------------------------
export const learnset = pgTable(
  "learnset",
  {
    /** FK → pokemon.id (within the same format). */
    pokemon_id: text("pokemon_id").notNull(),
    /** Canonical move slug, e.g. "will-o-wisp". */
    move_slug: text("move_slug").notNull(),
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** "level-up" | "machine" | "tutor". Egg moves excluded (out of scope). */
    method: text("method"),
  },
  (t) => [
    // Composite PK — (pokemon_id, move_slug, format)
    primaryKey({ columns: [t.pokemon_id, t.move_slug, t.format] }),
    // "what Pokémon learn move X?" — move_slug not the leftmost PK prefix
    index("learnset_move_slug_idx").on(t.move_slug),
    // lookup all moves for a given pokemon — redundant with PK prefix but
    // provides an explicit fast path and makes intent clear
    index("learnset_pokemon_id_idx").on(t.pokemon_id),
  ],
);

// ---------------------------------------------------------------------------
// reference_cache — DS-4 reference detail (pre-built per format at ingest)
// ---------------------------------------------------------------------------
export const reference_cache = pgTable(
  "reference_cache",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** e.g. "move/fake-out", "ability/armor-tail", "type/ground". */
    resource_key: text("resource_key").notNull(),
    /** "move" | "ability" | "type" | "evolution" | "item". */
    resource_kind: text("resource_kind").notNull(),
    /** Normalized detail shape the tool returns (JSON string, not raw source). */
    payload: text("payload").notNull(),
    /** Source label for citations (e.g. "@pkmn/dex (Pokémon Showdown)"). */
    endpoint_url: text("endpoint_url").notNull(),
    /** Epoch milliseconds the row was built (informational; no TTL anymore). */
    fetched_at: bigint("fetched_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.format, t.resource_key] })],
);

// ---------------------------------------------------------------------------
// searchable_names — backs resolve_entity (T1, BR-9)
// ---------------------------------------------------------------------------
export const searchable_names = pgTable(
  "searchable_names",
  {
    /** Data scope: "scarlet-violet" | "champions". Part of the composite PK. */
    format: text("format").notNull(),
    /** "pokemon" | "move" | "ability" | "type" | "item". */
    kind: text("kind").notNull(),
    /** Canonical slug. */
    slug: text("slug").notNull(),
    display_name: text("display_name").notNull(),
  },
  (t) => [
    // Composite PK — (format, kind, slug)
    primaryKey({ columns: [t.format, t.kind, t.slug] }),
  ],
);

// ---------------------------------------------------------------------------
// ingest_meta — pipeline bookkeeping (one row per format)
// ---------------------------------------------------------------------------
export const ingest_meta = pgTable("ingest_meta", {
  /** Data scope this row describes ("scarlet-violet" | "champions"). PK. */
  format: text("format").primaryKey(),
  /** Epoch ms of the last successful ingest run for this format. */
  last_success_at: bigint("last_success_at", { mode: "number" }).notNull(),
  /** Number of rows in the pokemon table for this format after ingest. */
  pokemon_count: integer("pokemon_count").notNull(),
  /** Number of rows in the learnset table for this format after ingest. */
  learnset_count: integer("learnset_count").notNull(),
  /** Number of rows in searchable_names for this format after ingest. */
  names_count: integer("names_count").notNull(),
  /**
   * Bumped when the physical schema changes; the app checks this at startup
   * to detect a stale/empty index and return index_unavailable gracefully.
   */
  schema_version: text("schema_version").notNull(),
});

// ===========================================================================
// Auth layer (docs/features/account-creation § Data Model)
//
// GLOBAL, NOT format-scoped — auth identity is orthogonal to the Pokédex index,
// so these three tables carry no `format` column. Epoch-ms timestamps are
// `bigint` with mode "number" (int4 overflows ~1.75e12), matching the
// fetched_at / last_success_at convention above.
// ===========================================================================

// ---------------------------------------------------------------------------
// account — one row per registered user (BR-A1: exactly one account per email)
// ---------------------------------------------------------------------------
export const account = pgTable(
  "account",
  {
    /** UUID (crypto.randomUUID()). */
    id: text("id").primaryKey(),
    /** Normalized (trim + lowercase) email — the account identity. UNIQUE. */
    email: text("email").notNull(),
    /** Epoch milliseconds the account was created. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    /**
     * Last game scope the user resolved a chat turn under (a `Format` literal).
     * NULL for brand-new accounts / never-chatted. Used as the default for the
     * next *new* conversation (signed-in only); per-conversation sticky format
     * still wins when resuming an existing thread.
     */
    last_used_scope: text("last_used_scope"),
  },
  (t) => [
    // Unique normalized email enforces BR-A1 ("exactly one account per email")
    // and powers the login/find-or-create lookup (BR-A2). PII: email is the
    // only identity field stored.
    uniqueIndex("account_email_idx").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// auth_session — one row per active device session (BR-A7, AC-4.3)
// ---------------------------------------------------------------------------
export const auth_session = pgTable(
  "auth_session",
  {
    /** UUID. */
    id: text("id").primaryKey(),
    /**
     * SHA-256 hex of the opaque cookie token. The raw token is NEVER stored
     * (BR-A2 / security) — only its hash, which is what resolve-on-request
     * looks up. UNIQUE.
     */
    token_hash: text("token_hash").notNull(),
    /**
     * Logical FK → account.id (a session always belongs to a real account,
     * BR-A9). Modeled as a plain indexed column — NOT a physical FK constraint —
     * matching this schema's existing convention (cf. learnset.pokemon_id →
     * pokemon.id, also a logical-only FK). Referential integrity is enforced in
     * the auth repo/service layer; the index below backs revoke/enumerate.
     */
    account_id: text("account_id").notNull(),
    /** Epoch ms the session was issued. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    /** Epoch ms (created_at + 30 days, BR-A7); a row past this reads as absent. */
    expires_at: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Resolve-on-request: every authenticated call looks up by token_hash.
    uniqueIndex("auth_session_token_hash_idx").on(t.token_hash),
    // Enumerate / revoke a single account's sessions (future multi-device work).
    index("auth_session_account_id_idx").on(t.account_id),
    // Lazy expired-session cleanup sweep (deleteExpiredSessions).
    index("auth_session_expires_at_idx").on(t.expires_at),
  ],
);

// ---------------------------------------------------------------------------
// otp_code — at most one active code per email; `email` PK ⇒ issuing a new code
// is an upsert that supersedes the prior row (BR-A5: only the latest code valid)
// ---------------------------------------------------------------------------
export const otp_code = pgTable("otp_code", {
  /**
   * Normalized email. PK (not an FK — a code can exist before its account does,
   * on first signup). Upsert-by-email overwrites the prior row, so only the most
   * recent code is ever valid (BR-A5).
   */
  email: text("email").primaryKey(),
  /**
   * HMAC-SHA256(AUTH_SECRET, `${email}:${code}`) hex. The 6-digit plaintext is
   * never stored/logged; the HMAC secret defeats precomputation of the 10⁶
   * possible codes from a DB leak.
   */
  code_hash: text("code_hash").notNull(),
  /** Epoch ms the code was issued; drives the resend cooldown (BR-A5). */
  created_at: bigint("created_at", { mode: "number" }).notNull(),
  /** Epoch ms (created_at + ~10 min, BR-A3); an expired code cannot authenticate. */
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
  /** Wrong-attempt counter; the code locks out at 5 (BR-A4). */
  attempts: integer("attempts").notNull(),
  /** Epoch ms of successful verify → single-use (BR-A3). Null until consumed. */
  consumed_at: bigint("consumed_at", { mode: "number" }),
});

// ===========================================================================
// Chat history (docs/features/chat-history § Data Model)
//
// Durable, account-scoped conversations for signed-in users (B-3). Like the
// auth tables these are GLOBAL (no `format` column) — `format` is a property of
// each conversation, not a partition of the store (BR-H6). Epoch-ms timestamps
// are `bigint` mode "number"; `pinned` is the 0/1 `integer` convention; FKs are
// logical indexed columns, NOT physical constraints (cf. auth_session.account_id),
// so deletes are explicit in the repo (no ON DELETE CASCADE).
// ===========================================================================

// ---------------------------------------------------------------------------
// conversation — one row per saved conversation (HIST-AD-1: id = client session_id)
// ---------------------------------------------------------------------------
export const conversation = pgTable(
  "conversation",
  {
    /**
     * The client `session_id` for this conversation (HIST-AD-1) — a
     * client-generated UUID. NEVER trusted alone for isolation; every query
     * also filters by account_id (BR-H1).
     */
    id: text("id").primaryKey(),
    /**
     * Logical FK → account.id; every read/write filters by it (BR-H1 / BR-A9).
     * Plain indexed column, not a physical FK (schema convention).
     */
    account_id: text("account_id").notNull(),
    /** Derived from the first user message; renamable (BR-H7). */
    title: text("title").notNull(),
    /** "scarlet-violet" | "champions"; fixed for the conversation's life (BR-H6). */
    format: text("format").notNull(),
    /** 0/1; pinned conversations group above the rest (HIST-US-9). */
    pinned: integer("pinned").notNull().default(0),
    /**
     * Logical FK → conversation_folder.id. NULL = unfiled (ORG-BR-1).
     */
    folder_id: text("folder_id"),
    /** 0/1; archived conversations are hidden from the default list (ORG-BR-2). */
    archived: integer("archived").notNull().default(0),
    /** Epoch ms the conversation was created. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    /** Epoch ms of last activity — drives most-recently-active list ordering. */
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Per-account list query: ORDER BY pinned DESC, updated_at DESC, scoped to
    // account_id. account_id leads so the filter uses the index prefix.
    index("conversation_account_updated_idx").on(t.account_id, t.updated_at),
    index("conversation_account_folder_idx").on(t.account_id, t.folder_id),
    index("conversation_account_archived_idx").on(t.account_id, t.archived),
  ],
);

// ---------------------------------------------------------------------------
// conversation_message — one row per turn (HIST-AD-2)
// ---------------------------------------------------------------------------
export const conversation_message = pgTable(
  "conversation_message",
  {
    /**
     * UUID. For the guest→sign-in import path this is the client `ChatTurn.id`
     * so the import is idempotent (ON CONFLICT (id) DO NOTHING); for the
     * server-authoritative append path the route mints a fresh UUID.
     */
    id: text("id").primaryKey(),
    /** Logical FK → conversation.id. */
    conversation_id: text("conversation_id").notNull(),
    /** Denormalized account.id for isolation-safe queries + delete (BR-H1). */
    account_id: text("account_id").notNull(),
    /** Monotonic order within the conversation (0,1,2,…). */
    seq: integer("seq").notNull(),
    /** "user" | "assistant". */
    role: text("role").notNull(),
    /**
     * Human-visible text: the user message, or the assistant `answer_markdown`.
     * Powers ILIKE search (BR-H11) and the model re-feed (BR-H5) without parsing
     * answer_json. Intentionally denormalized out of answer_json.
     */
    text_content: text("text_content").notNull(),
    /**
     * Full `OakAnswer` JSON (assistant rows only; NULL for user rows) —
     * powers exact re-render (BR-H3). TEXT JSON, like reference_cache.payload.
     */
    answer_json: text("answer_json"),
    /**
     * 0/1; meaningful on assistant rows only (PIN-BR-1). Default 0.
     */
    pinned: integer("pinned").notNull().default(0),
    /** Epoch ms the turn was stored. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Ordered load AND the seq-uniqueness backstop: a UNIQUE (conversation_id,
    // seq) turns a concurrent-append race into a clean conflict instead of a
    // silently duplicated seq. appendTurnPair serializes on the conversation row.
    uniqueIndex("message_conversation_seq_idx").on(
      t.conversation_id,
      t.seq,
    ),
    // Isolation / cleanup queries by owning account.
    index("message_account_idx").on(t.account_id),
  ],
);

// ===========================================================================
// Chat QoL — folders, scope MRU, public-share snapshots
// (docs/features/chat-qol § Data Model)
//
// Additive tables. Logical FKs only. Epoch-ms bigint, 0/1 integers.
// ===========================================================================

// ---------------------------------------------------------------------------
// conversation_folder — per-account named folders (ORG-BR-1)
// ---------------------------------------------------------------------------
export const conversation_folder = pgTable(
  "conversation_folder",
  {
    /** UUID. */
    id: text("id").primaryKey(),
    /** Logical FK → account.id. */
    account_id: text("account_id").notNull(),
    /** 1–40 chars; unique per account ILIKE. */
    name: text("name").notNull(),
    /** Epoch ms. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("conversation_folder_account_name_unique").on(
      t.account_id,
      sql`lower(${t.name})`,
    ),
    index("conversation_folder_account_name_idx").on(t.account_id, t.name),
  ],
);

// ---------------------------------------------------------------------------
// account_scope_mru — last-used timestamp per (account, format)
// ---------------------------------------------------------------------------
export const account_scope_mru = pgTable(
  "account_scope_mru",
  {
    account_id: text("account_id").notNull(),
    /** One of the eleven Format literals. */
    format: text("format").notNull(),
    /** Epoch ms of last chip pick or resolved sent turn. */
    last_used_at: bigint("last_used_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.account_id, t.format] })],
);

// ---------------------------------------------------------------------------
// shared_answer — immutable public-share snapshot (SHARE-BR-2)
// ---------------------------------------------------------------------------
export const shared_answer = pgTable(
  "shared_answer",
  {
    /** nanoid(21). */
    id: text("id").primaryKey(),
    /** Logical FK → account.id (owner; revoke / deleteAccount). */
    account_id: text("account_id").notNull(),
    /** Informational; conversation delete does not touch this row. */
    conversation_id: text("conversation_id"),
    conversation_title: text("conversation_title").notNull(),
    question_text: text("question_text").notNull(),
    /** Full OakAnswer JSON, snapshotted at create time. */
    answer_json: text("answer_json").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    /** NULL = live. Set on revoke; never restored. */
    revoked_at: bigint("revoked_at", { mode: "number" }),
  },
  (t) => [
    index("shared_answer_account_created_idx").on(t.account_id, t.created_at),
  ],
);

// ===========================================================================
// Team builder (docs/features/team-builder § Data Model)
//
// Durable, account-scoped competitive teams for signed-in users (B-2). Like the
// auth/chat-history tables this is GLOBAL (no `format` column) — a team's
// `format` is a per-row property fixed for its life (BR-T3), not a partition of
// the store. Epoch-ms timestamps are `bigint` mode "number"; the `members`
// array is stored whole as JSON TEXT (the reference_cache.payload /
// conversation_message.answer_json convention) since teams are always read and
// written as a unit. FKs are logical indexed columns, NOT physical constraints
// (cf. conversation.account_id), so deletes are explicit in the repo. Saved
// teams are referenced by name in chat (resolved live via list_teams/get_team),
// so no other table stores a team id to clear on delete.
// ===========================================================================

// ---------------------------------------------------------------------------
// team — one row per saved team (TEAM-AD-1: members stored as a JSON column)
// ---------------------------------------------------------------------------
export const team = pgTable(
  "team",
  {
    /** UUID (crypto.randomUUID()). */
    id: text("id").primaryKey(),
    /**
     * Logical FK → account.id; every read/write filters by it (BR-T2 / BR-A9).
     * Plain indexed column, not a physical FK (schema convention). A team owned
     * by another account is indistinguishable from missing (404, never 403).
     */
    account_id: text("account_id").notNull(),
    /** "scarlet-violet" | "champions"; fixed for the team's life (BR-T3). */
    format: text("format").notNull(),
    /** User-facing name; non-empty (defaults to "Untitled team", BR-T1/AC-1.2). */
    name: text("name").notNull(),
    /**
     * JSON: TeamMember[] (0–6), validated by `teamMembersSchema`
     * (src/data/teams/team-schema.ts). Stored whole — no cross-member SQL.
     */
    members: text("members").notNull(),
    /**
     * Optional free-text win condition / game plan (team-analysis Phase 3).
     * NULL when unset. Capped at the app layer (~280 chars).
     */
    win_condition: text("win_condition"),
    /** Epoch ms the team was created. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    /** Epoch ms of last edit — drives list ordering (ORDER BY updated_at DESC). */
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Per-account list query: ORDER BY updated_at DESC scoped to account_id.
    // account_id leads so the filter uses the index prefix; format is filtered
    // in the query (tiny N per account).
    index("team_account_updated_idx").on(t.account_id, t.updated_at),
  ],
);

// ===========================================================================
// Admin panel — usage recording (docs/features/admin-panel § Data Model)
//
// Two APPEND-ONLY tables that back the read-only admin/observability panel
// (ADMIN-US-6). Written once on a NON-BLOCKING, fire-and-forget path
// (ADMIN-BR-3) and NEVER updated; the panel only reads them. Like the
// auth/chat/team tables these are GLOBAL (no `format` column — `mode` is a
// per-row property), epoch-ms timestamps are `bigint` mode "number", JSON is
// stored whole as TEXT, FKs are logical (un-constrained) indexed columns, and
// indexes target the panel's query patterns. No existing table is altered.
// ===========================================================================

// ---------------------------------------------------------------------------
// turn_record — one row per chat turn, guest and signed-in (ADMIN-US-6, AD-3/AD-4)
//
// The persisted form of the runtime's `TurnTrace` plus the turn's content. The
// PK is the turn's `request_id` (one row per turn). `account_id` is nullable
// (null ⇒ guest turn). The recorded `status` is a SUPERSET of the agent's
// `TurnStatus`: it adds "rate_limited" for requests rejected before the model
// ran (AD-4) — those rows are inserted on the chat route's rate-limit branch
// BEFORE the model is resolved, so `model` / `provider_model` are NULLABLE here
// (no resolved model yet) and `answer_text` / `answer_json` are null. The
// analytics repo treats a null `model` as "n/a".
// ---------------------------------------------------------------------------
export const turn_record = pgTable(
  "turn_record",
  {
    /** = the turn's `request_id` (UUID, unique per turn). PK. */
    id: text("id").primaryKey(),
    /** Conversation/session id (groups a session's turns). */
    session_id: text("session_id").notNull(),
    /** Logical FK → account.id; NULL ⇒ guest turn. */
    account_id: text("account_id"),
    /**
     * The registry `ModelKey` active at the time of the turn; keys the cost
     * lookup. Keys evolve as the registry grows/retires entries, so historical
     * rows may hold a key no longer offered (e.g. a retired "claude" key) — the
     * analytics repo looks up whatever string is stored, not a fixed union.
     * NULLABLE: a "rate_limited" row is recorded before the model is resolved,
     * so it has no model. The analytics repo treats null as "n/a".
     */
    model: text("model"),
    /**
     * Provider API model id from the trace (e.g. "grok-2"). NULLABLE for the
     * same reason as `model` — unresolved on the rate-limit branch.
     */
    provider_model: text("provider_model"),
    /** "standard" | "champions". */
    mode: text("mode").notNull(),
    /**
     * Recorded status — a SUPERSET of the agent's TurnStatus (AD-4):
     * "answered" | "clarification_needed" | "resolution_failed" |
     * "insufficient_data" | "rate_limited".
     */
    status: text("status").notNull(),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    thinking_tokens: integer("thinking_tokens").notNull().default(0),
    /** Prompt-cache hits when the provider reports them; 0 if unknown. */
    cached_input_tokens: integer("cached_input_tokens").notNull().default(0),
    /** JSON `ToolTraceEntry[]` (stringified by the repo). */
    tool_trace: text("tool_trace").notNull().default("[]"),
    /**
     * Denormalized count of tool_trace entries with `error != null` — derived
     * by the repo on insert, for cheap error rollups (no JSON parse on read).
     */
    tool_error_count: integer("tool_error_count").notNull().default(0),
    citation_count: integer("citation_count").notNull().default(0),
    turn_latency_ms: integer("turn_latency_ms").notNull().default(0),
    /** Attached image count; image bytes are NEVER stored. */
    images_count: integer("images_count").notNull().default(0),
    /**
     * Client platform that issued the turn (`web` | `ios` | `android`), from
     * the `X-Oak-Client` request header. NULL for legacy rows (pre-column) and
     * for requests that omitted/sent an invalid header — never invent a default.
     */
    client: text("client"),
    /** The user message (searchable; empty when image-only). */
    prompt_text: text("prompt_text").notNull().default(""),
    /** `answer_markdown` (searchable; null for "rate_limited"). */
    answer_text: text("answer_text"),
    /** Full `OakAnswer` JSON for drill-down re-render (null for "rate_limited"). */
    answer_json: text("answer_json"),
    /** Epoch ms; the primary time dimension for all series/rollups. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Time-series + retention scans.
    index("turn_record_created_idx").on(t.created_at),
    // Per-account activity & heavy-user rollups.
    index("turn_record_account_created_idx").on(t.account_id, t.created_at),
    // Group a session's turns.
    index("turn_record_session_idx").on(t.session_id),
    // Errors view (status filter over a range).
    index("turn_record_status_created_idx").on(t.status, t.created_at),
    // Cost-by-model.
    index("turn_record_model_created_idx").on(t.model, t.created_at),
  ],
);

// ---------------------------------------------------------------------------
// auth_event — one row per auth event (ADMIN-US-6)
//
// Append-only; recorded fire-and-forget alongside the existing auth logs.
// ---------------------------------------------------------------------------
export const auth_event = pgTable(
  "auth_event",
  {
    /** UUID. PK. */
    id: text("id").primaryKey(),
    /** "otp_requested" | "otp_verified" | "otp_email_failed". */
    type: text("type").notNull(),
    /** The email involved (normalized); nullable. */
    email: text("email"),
    /** Logical FK → account.id; set on "otp_verified", null otherwise. */
    account_id: text("account_id"),
    /** For "otp_verified": 1 = new signup, 0 = returning sign-in; null otherwise. */
    created_flag: integer("created_flag"),
    /** JSON extra (e.g. the error string on "otp_email_failed"); nullable. */
    detail: text("detail"),
    /** Epoch ms. */
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Time-series scans.
    index("auth_event_created_idx").on(t.created_at),
    // Per-type rollups over a range (signups vs sign-ins vs email failures).
    index("auth_event_type_created_idx").on(t.type, t.created_at),
  ],
);

// ===========================================================================
// Champions item availability (operator-curated)
//
// Pokémon Champions is still rolling out its item pool, and the @pkmn data set
// carries NO per-item Champions legality (its `champions` mod curates the
// species roster but ships no item data), so the Champions index otherwise
// treats every Gen-9 item as legal. This table records the small set of items
// the operator has marked NOT-yet-available in Champions, curated from the admin
// panel. The effective Champions item allowlist is
//   (all Champions items in searchable_names) − (rows here),
// so the default (empty table) leaves every item available ("pre-select all")
// and a newly-ingested item stays available until the operator excludes it.
//
// CHAMPIONS-ONLY by design — the concept does not exist for scarlet-violet, so
// unlike the format-scoped index tables there is NO `format` column. Read at
// query time (resolve-index / validate-team / get_item) so an operator toggle
// takes effect immediately with no re-ingest. `excluded_at` is epoch ms
// (`bigint` mode "number", matching the schema's timestamp convention).
// ===========================================================================
export const champions_item_exclusion = pgTable("champions_item_exclusion", {
  /** Canonical item slug — matches searchable_names.slug (kind="item"). PK. */
  slug: text("slug").primaryKey(),
  /** Epoch ms the item was excluded (informational / audit). */
  excluded_at: bigint("excluded_at", { mode: "number" }).notNull(),
  /** Admin email that made the change; null if unknown. Audit only. */
  excluded_by: text("excluded_by"),
});

// ===========================================================================
// app_setting — generic operator-controlled key/value store
//
// A small general-purpose settings table, keyed by an arbitrary string, so the
// admin panel can persist operator choices without a bespoke table per setting.
// The first consumer is the active-model switch ("active_model" → a `ModelKey`,
// see src/data/repos/settings-repo.ts) that replaces the old `ACTIVE_MODEL` Fly
// secret; more keys can be added later without a schema change.
//
// Deliberately NOT granted to `oak_readonly` and NOT in the `run_sql` warehouse
// allowlist (prompts/warehouse-ddl.ts) — this is operator config, not a fact the
// agent should read or expose to a user.
// ===========================================================================
export const app_setting = pgTable("app_setting", {
  /** Setting name, e.g. "active_model". PK. */
  key: text("key").primaryKey(),
  /** The setting's value, stored as text (callers parse/validate it). */
  value: text("value").notNull(),
  /** Admin email that last changed it; null if unknown. Audit only. */
  updated_by: text("updated_by"),
  /** Epoch ms of the last write. */
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
});

// ===========================================================================
// Natdex warehouse — global Pokédex-wide tables (Oak v2, design §4.1)
//
// Five GLOBAL tables built OFFLINE from the PokeAPI CSV dump + the Pokémon
// Mystery Dungeon dataset (scripts/fetch-pokeapi-natdex.ts → committed JSON
// snapshots → the build-natdex/machines/classic-encounters/pmd builders). They
// give the agent (via the later `run_sql` tool) whole-franchise facts the
// per-format @pkmn index can't express: colors, shapes, catch rates, national
// dex numbers, evolution parents, TM/HM machines, Gens 1–4 moves, classic wild
// encounters, and PMD recruit data.
//
// Unlike the pokemon/learnset/reference_cache index tables these carry NO
// `format` column — they are not format-partitioned (keyed by species /
// version-group / move slug). Following the schema's conventions: snake_case
// columns, no physical FK constraints (species / move slugs are logical joins
// resolved in SQL), no native booleans, epoch-ms would be `bigint` (none here).
// Built ONCE per ingest run (not per format) via a replace-all delete+insert
// inside the same atomic ingest transaction.
// ===========================================================================

// ---------------------------------------------------------------------------
// natdex_species — one row per national-dex species
// ---------------------------------------------------------------------------
export const natdex_species = pgTable(
  "natdex_species",
  {
    /** PokeAPI species slug, e.g. "pikachu". PK. */
    species: text("species").primaryKey(),
    /** National Pokédex number (= PokeAPI species id). */
    national_dex_number: integer("national_dex_number").notNull(),
    /** Generation introduced (1–9). */
    generation: integer("generation").notNull(),
    /** Pokédex color slug, e.g. "yellow"; null if unset. */
    color: text("color"),
    /** Body-shape slug, e.g. "quadruped"; null if unset. */
    shape: text("shape"),
    /** Catch rate (0–255); null if unknown. */
    capture_rate: integer("capture_rate"),
    /** Sum of the six base stats of the species' default form. */
    base_stat_total: integer("base_stat_total").notNull(),
    /** Pre-evolution species slug (logical FK → natdex_species.species); null if none. */
    evolves_from: text("evolves_from"),
    /** Primary type slug of the default form. */
    type1: text("type1").notNull(),
    /** Secondary type slug; null for mono-type species. */
    type2: text("type2"),
  },
  (t) => [
    index("natdex_species_national_dex_number_idx").on(t.national_dex_number),
    index("natdex_species_generation_idx").on(t.generation),
    index("natdex_species_color_idx").on(t.color),
    index("natdex_species_shape_idx").on(t.shape),
    index("natdex_species_type1_idx").on(t.type1),
    index("natdex_species_type2_idx").on(t.type2),
    index("natdex_species_evolves_from_idx").on(t.evolves_from),
  ],
);

// ---------------------------------------------------------------------------
// natdex_machines — TM/HM/TR machines per version group
// ---------------------------------------------------------------------------
export const natdex_machines = pgTable(
  "natdex_machines",
  {
    /** Version-group slug, e.g. "heartgold-soulsilver". Part of the PK. */
    version_group: text("version_group").notNull(),
    /** Machine label, e.g. "HM02" / "TM24" / "TR50". Part of the PK. */
    machine: text("machine").notNull(),
    /** Canonical move slug the machine teaches, e.g. "fly". */
    move_slug: text("move_slug").notNull(),
    /** Canonical item slug of the machine itself, e.g. "hm02". */
    item_slug: text("item_slug").notNull(),
  },
  (t) => [
    // A machine label is unique within a version group.
    primaryKey({ columns: [t.version_group, t.machine] }),
    // "which machine teaches move X (and where)?"
    index("natdex_machines_move_slug_idx").on(t.move_slug),
  ],
);

// ---------------------------------------------------------------------------
// natdex_moves — every move's generation / type / damage class
// ---------------------------------------------------------------------------
export const natdex_moves = pgTable(
  "natdex_moves",
  {
    /** Canonical move slug, e.g. "fire-fang". PK. */
    move_slug: text("move_slug").primaryKey(),
    /** Generation introduced (1–9). */
    generation: integer("generation").notNull(),
    /** Type slug, e.g. "fire"; null if unset. */
    type: text("type"),
    /** "physical" | "special" | "status"; null if unset. */
    damage_class: text("damage_class"),
  },
  (t) => [
    index("natdex_moves_generation_idx").on(t.generation),
    index("natdex_moves_type_idx").on(t.type),
  ],
);

// ---------------------------------------------------------------------------
// classic_encounters — wild-encounter tables, Gens 1–7 ONLY (best-effort)
//
// PokeAPI has NO Gen 8–9 encounter data and known Gen 1–7 holes, so every answer
// sourced from this table must be flaggable as partial. `id` is a synthetic
// sequential key assigned by the builder (there is no natural PK after the
// per-version/slot rows are deduped).
// ---------------------------------------------------------------------------
export const classic_encounters = pgTable(
  "classic_encounters",
  {
    /** Synthetic sequential id (builder-assigned). PK. */
    id: integer("id").primaryKey(),
    /** Game version slug, e.g. "gold". */
    version: text("version").notNull(),
    /** Location slug, e.g. "johto-route-29". */
    location: text("location").notNull(),
    /** Sub-area slug within the location; null when PokeAPI records none. */
    area: text("area"),
    /** Encounter method slug, e.g. "walk" / "surf" / "old-rod". */
    method: text("method").notNull(),
    /** Species slug encountered, e.g. "pidgey". */
    species: text("species").notNull(),
    /** Encounter-slot rarity weight; null if unknown. */
    rarity: integer("rarity"),
    /** Minimum wild level; null if unknown. */
    min_level: integer("min_level"),
    /** Maximum wild level; null if unknown. */
    max_level: integer("max_level"),
  },
  (t) => [
    index("classic_encounters_species_idx").on(t.species),
    index("classic_encounters_version_idx").on(t.version),
    index("classic_encounters_location_idx").on(t.location),
  ],
);

// ---------------------------------------------------------------------------
// pmd_recruits — Pokémon Mystery Dungeon recruit locations + rates
// ---------------------------------------------------------------------------
export const pmd_recruits = pgTable(
  "pmd_recruits",
  {
    /** Game slug: "red-blue-rescue-team" | "explorers-of-sky". Part of the PK. */
    game: text("game").notNull(),
    /** Species slug, e.g. "bulbasaur". Part of the PK. */
    species: text("species").notNull(),
    /** Recruit location description (free text, as scraped). */
    location: text("location").notNull(),
    /** Recruit rate as a display string, e.g. "12.5%"; null if unknown. */
    recruit_rate: text("recruit_rate"),
    /** Friend-area name (Rescue Team mechanic); null if unset. */
    friend_area: text("friend_area"),
  },
  (t) => [
    // One row per species per game.
    primaryKey({ columns: [t.game, t.species] }),
    index("pmd_recruits_species_idx").on(t.species),
  ],
);

// ===========================================================================
// Fandom wiki corpus — global prose retrieval tables (Oak v2, design §4.2/§5)
//
// Two GLOBAL tables backing T19 `search_wiki`: a self-built, hybrid-lexical
// retrieval corpus crawled from pokemon.fandom.com (CC BY-SA 4.0 —
// commercial-safe, unlike the CC BY-NC-SA Bulbapedia which is NEVER ingested).
// They answer anime/movie/character/PMD/lore/trivia questions Oak's structured
// @pkmn + natdex data can't. Like the natdex warehouse these carry NO `format`
// column — the wiki is franchise-wide. Built ONCE per ingest run from the
// gitignored `web/.wiki-cache/` (fetched by `npm run fetch:wiki`), replaced
// wholesale inside the same atomic transaction as every other table.
//
// v1 retrieval is Postgres BUILT-IN full-text search only (tsvector + GIN) — NO
// pgvector (unavailable on prod Fly Postgres; hybrid/embeddings is a documented
// later follow-up). The `tsv` column on `wiki_chunk` is a STORED GENERATED
// column so the index is always in lock-step with the content and no writer has
// to maintain it. Attribution (license + canonical url + revision timestamp) is
// stored per page so every wiki-sourced answer can cite it as required.
// ===========================================================================

// ---------------------------------------------------------------------------
// wiki_page — one row per crawled Fandom page (attribution + provenance)
// ---------------------------------------------------------------------------
export const wiki_page = pgTable(
  "wiki_page",
  {
    /** Stable page id — the slugified canonical title, e.g. "ash-ketchum". PK. */
    id: text("id").primaryKey(),
    /** Display title as shown on the wiki, e.g. "Ash Ketchum". */
    title: text("title").notNull(),
    /** Canonical page URL (surfaced in citations). */
    url: text("url").notNull(),
    /** Epoch ms of the page's last wiki revision; null if the crawl lacked it. */
    revised_at: bigint("revised_at", { mode: "number" }),
    /** License string, e.g. "CC BY-SA 4.0" (attribution requirement). */
    license: text("license").notNull(),
  },
  (t) => [index("wiki_page_title_idx").on(t.title)],
);

// ---------------------------------------------------------------------------
// wiki_chunk — one row per (page, section) prose chunk, full-text indexed
// ---------------------------------------------------------------------------
export const wiki_chunk = pgTable(
  "wiki_chunk",
  {
    /** Stable chunk id — `${page_id}#${section_index}`. PK. */
    id: text("id").primaryKey(),
    /** Owning page (logical FK → wiki_page.id; no physical constraint). */
    page_id: text("page_id").notNull(),
    /** Section heading this chunk came from, e.g. "Biography". */
    section: text("section").notNull(),
    /** The stripped plain-prose text of the section. */
    content: text("content").notNull(),
    /**
     * Full-text search vector — a STORED GENERATED column derived from
     * section + content. Never written directly; Postgres computes it on
     * insert/update. Referenced by column NAME (not the Drizzle column, to avoid
     * a self-reference in this table definition) — matches the hand-verified
     * migration SQL exactly.
     */
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(section, '') || ' ' || coalesce(content, ''))`,
    ),
  },
  (t) => [
    index("wiki_chunk_page_id_idx").on(t.page_id),
    // GIN index over the generated tsvector — the retrieval hot path.
    index("wiki_chunk_tsv_idx").using("gin", t.tsv),
  ],
);

// ===========================================================================
// Smogon metagame warehouse — competitive ladder usage stats (backlog B-5)
//
// Two GLOBAL tables populated by `npm run sync:meta` (src/ingest/sync-meta.ts)
// — the ONE network-fetching DB writer in the codebase; ingest itself stays
// fully offline (see "Data layer — built from @pkmn" in CLAUDE.md). Each month
// of a competitive ladder (see `@/data/meta-formats`, the MetaFormat axis —
// deliberately separate from the six-scope data Format/AgentMode) is fetched
// from Smogon's published chaos stats, transformed, and replaced wholesale for
// its (meta_format, month) pair — never partial-written. Retention is ALL
// synced months (no pruning). Exposed read-only through the T18 `run_sql`
// sandbox (see `oak_readonly` grants + `WAREHOUSE_ALLOWLIST`) and via the
// typed T21 `get_meta_usage` tool. Champions is intentionally absent here —
// its usage stats are served live by T15 `get_usage_stats`, never stored.
//
// Following the schema's conventions: snake_case columns, NO jsonb (JSON
// payloads are `text` columns holding a JSON string, documented per-column
// below), no physical FK constraints (meta_format/species are logical joins
// resolved in SQL), epoch-ms timestamps as `bigint` with `mode: "number"`.
// `usage_pct` is this schema's first `doublePrecision` column — usage stats
// are inherently fractional (0–100), unlike every other numeric column here.
// ===========================================================================

// ---------------------------------------------------------------------------
// meta_snapshot — one row per (meta_format, month) sync, snapshot bookkeeping
// ---------------------------------------------------------------------------
export const meta_snapshot = pgTable(
  "meta_snapshot",
  {
    /** Ladder id, e.g. "gen9ou" (see MetaFormat). Part of the PK. */
    meta_format: text("meta_format").notNull(),
    /** Month this snapshot covers, "YYYY-MM". Part of the PK. */
    month: text("month").notNull(),
    /** Exact Smogon format id used for the fetch, e.g. "gen9ou". */
    smogon_format_id: text("smogon_format_id").notNull(),
    /** Minimum-battles usage cutoff this snapshot was fetched at. */
    cutoff: integer("cutoff").notNull(),
    /** Total ladder battles Smogon recorded for the month; null if unpublished. */
    total_battles: integer("total_battles"),
    /** Count of distinct species present in this snapshot's meta_usage rows. */
    species_count: integer("species_count").notNull(),
    /** Epoch ms this snapshot was fetched by sync-meta. */
    fetched_at: bigint("fetched_at", { mode: "number" }).notNull(),
    /** Source chaos-stats URL fetched (citation/audit). */
    source_url: text("source_url").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.meta_format, t.month] }),
    // Month-scoped scans across ladders (e.g. "what's synced for 2026-06?").
    index("meta_snapshot_month_idx").on(t.month),
  ],
);

// ---------------------------------------------------------------------------
// meta_usage — one row per (meta_format, month, species) usage-stats entry
// ---------------------------------------------------------------------------
export const meta_usage = pgTable(
  "meta_usage",
  {
    /** Ladder id, e.g. "gen9ou". Part of the PK. */
    meta_format: text("meta_format").notNull(),
    /** Month this row covers, "YYYY-MM". Part of the PK. */
    month: text("month").notNull(),
    /** Oak canonical species slug (resolved via searchable_names). Part of the PK. */
    species: text("species").notNull(),
    /** Raw Smogon display name as published, e.g. "Urshifu-Rapid-Strike". */
    display_name: text("display_name").notNull(),
    /** Usage rank within the month (1 = most used). */
    rank: integer("rank").notNull(),
    /** Usage percentage, 0–100. This schema's first doublePrecision column. */
    usage_pct: doublePrecision("usage_pct").notNull(),
    /** Raw weighted usage count backing usage_pct; null if not published. */
    raw_count: integer("raw_count"),
    /** JSON string: top 15 `{name, slug, pct}` moves by usage. */
    moves: text("moves").notNull(),
    /** JSON string: top 15 `{name, slug, pct}` held items by usage. */
    items: text("items").notNull(),
    /** JSON string: top 15 `{name, slug, pct}` abilities by usage. */
    abilities: text("abilities").notNull(),
    /**
     * JSON string: top 10 `{nature, evs, pct}` spreads by usage. `evs` is a
     * "252/0/0/252/4/0" string in HP/Atk/Def/SpA/SpD/Spe order.
     */
    spreads: text("spreads").notNull(),
    /** JSON string: top 12 `{name, slug, pct}` teammates by usage. */
    teammates: text("teammates").notNull(),
    /**
     * JSON string: top 10 `{name, slug, score, ko_or_switch_pct, n}`
     * checks-and-counters entries, sorted by `score` desc. `score` is Smogon's
     * C&C ranking score `(p − 4·d) × 100`; `ko_or_switch_pct` is `p × 100` (the
     * KO-or-forced-switch rate); `n` is the weighted encounter count.
     */
    counters: text("counters").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.meta_format, t.month, t.species] }),
    // Leaderboard reads: top-N by rank within a (ladder, month).
    index("meta_usage_rank_idx").on(t.meta_format, t.month, t.rank),
    // Per-species lookups/trend queries across months.
    index("meta_usage_species_idx").on(t.species),
  ],
);
