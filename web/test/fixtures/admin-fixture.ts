/**
 * test/fixtures/admin-fixture.ts — the shared, deterministic seed for BOTH
 * admin read-repo ORACLE TESTS (Phase 4): `admin-analytics-repo.oracle.test.ts`
 * and `admin-content-repo.oracle.test.ts`. A SINGLE ground-truth dataset both
 * suites assert against.
 *
 * This file is NOT a test itself (no `.test.ts` suffix → vitest does not collect
 * it). It seeds the two append-only recording tables (`turn_record`,
 * `auth_event`) plus the reused read-only tables (`account`, `auth_session`,
 * `conversation`, `conversation_message`, `team`) with a SMALL, FULLY-DOCUMENTED
 * dataset whose aggregates are known by construction, so the oracle tests can
 * assert exact bucket counts, distinct active-user counts, cost rollups, the
 * ADMIN-BR-9 error taxonomy, heavy-user rankings, and cross-account
 * listing/search/keyset pagination against ground truth rather than the impl's
 * own output.
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Data Model (turn_record, auth_event, reused tables)
 *       § Interface Definitions › admin-analytics-repo / admin-content-repo
 *       § Technical Decisions AD-4 (rate_limited rows), AD-6/ADMIN-BR-5 (cost),
 *         AD-7 (UTC bucketing / ilike search / keyset on (created_at,id)).
 *   - requirements.md ADMIN-US-2/3/4/5/8/9/10/11, ADMIN-BR-8 (date-range),
 *     ADMIN-BR-9 (failure taxonomy).
 *
 * DETERMINISM (hard rule): EVERY timestamp here is a hard-coded constant derived
 * from the fixed UTC anchor BASE — there is NO `Date.now()` anywhere, so day/hour
 * `date_trunc` bucketing and keyset ordering are stable on any clock. The two
 * repo functions that read the wall clock are tested by PINNING the clock in the
 * suite, not by seeding clock-relative rows:
 *   - `getLive` reads `Date.now()` for its last-hour window → the analytics suite
 *     pins `Date.now()` to {@link LIVE_NOW} (fake `Date` only) around that block.
 *   - `getAccountDetail` filters sessions on `expires_at > Date.now()` → the
 *     active sessions use a year-2286 {@link FAR_FUTURE} expiry (always live) and
 *     one session uses a year-2025 past expiry (always expired), so the
 *     active/expired split is deterministic without pinning the clock.
 *
 * TIME LAYOUT (UTC):
 *   ADMIN_RANGE = [BASE, BASE + 3*DAY)  → UTC day buckets Jan-5 / Jan-6 / Jan-7.
 *   `to` is EXCLUSIVE (a turn exactly at BASE+3*DAY is NOT counted).
 *
 * ACCOUNT-vs-GUEST INVARIANT (keeps `listAccounts` lifetime activity clean):
 * every turn that belongs to a real ACCOUNT (A/B/C) is IN-RANGE, so each
 * account's lifetime activity equals its in-range activity. All out-of-range,
 * live, and keyset-tie rows are GUEST turns (account_id null) — they exercise
 * range scoping / live / pagination without polluting per-account rollups.
 *
 * The seeder writes via Drizzle inserts over the node-postgres handle, so it
 * depends only on the committed schema, not on any Phase-4 code.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/data/schema";
import {
  account,
  auth_event,
  auth_session,
  conversation,
  conversation_message,
  team,
  turn_record,
} from "@/data/schema";
import type { TeamMember } from "@/data/teams/team-schema";
import type { ToolTraceEntry } from "@/server/logger";

/** A Drizzle handle typed over the full Oak schema (node-postgres). */
export type AdminFixtureDb = NodePgDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// Time constants (all fixed; no Date.now)
// ---------------------------------------------------------------------------

/** Anchor instant for the whole fixture: 2025-01-05 00:00:00 UTC. */
export const BASE = Date.UTC(2025, 0, 5, 0, 0, 0);
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/**
 * Year-2286 expiry → a session with this `expires_at` is ALWAYS active relative
 * to any plausible test clock (so `getAccountDetail` returns it deterministically
 * without pinning the clock).
 */
export const FAR_FUTURE = 9_999_999_999_999;

/**
 * Fixed "now" the analytics suite pins `Date.now()` to when testing `getLive`.
 * Far enough after every historical row (BASE + 100 days) that the live rows are
 * the newest, and that no historical row falls inside the last-hour window.
 */
export const LIVE_NOW = BASE + 100 * DAY;

/** Fixed instant for the keyset-tie guest rows (after the range, before LIVE_NOW). */
export const TIE_AT = BASE + 10 * DAY;

/** Canonical 3-day, day-bucketed analytics window used by the oracle tests. */
export const ADMIN_RANGE = {
  from: BASE,
  to: BASE + 3 * DAY,
  bucket: "day" as const,
};

// ---------------------------------------------------------------------------
// Accounts (3) — A & B sign up INSIDE the range, C is an older account.
// ---------------------------------------------------------------------------

export const ACCOUNTS = {
  /** ash — signs up on Jan-5 (inside range); the heaviest user (4 turns). */
  A: { id: "acct-ash", email: "ash@pallet.town", createdAt: BASE + HOUR },
  /** misty — signs up on Jan-6 (inside range). */
  B: { id: "acct-misty", email: "misty@cerulean.gym", createdAt: BASE + DAY + 2 * HOUR },
  /** brock — older account created BEFORE the range (not a range signup). */
  C: { id: "acct-brock", email: "brock@pewter.gym", createdAt: BASE - 5 * DAY },
} as const;

// ---------------------------------------------------------------------------
// Sessions — A: two active (FAR_FUTURE) + one expired; B & C: one active each.
// ---------------------------------------------------------------------------

export const SESSIONS = {
  /** A's older active session (created first). */
  A1: { id: "sess-row-A1", accountId: ACCOUNTS.A.id, createdAt: BASE + HOUR },
  /** A's newer active session (created later → first in the detail list). */
  A2: { id: "sess-row-A2", accountId: ACCOUNTS.A.id, createdAt: BASE + DAY + HOUR },
  /** A's EXPIRED session (year-2025 expiry → excluded from the active list). */
  AExpired: { id: "sess-row-A-exp", accountId: ACCOUNTS.A.id, createdAt: BASE + 30 * MINUTE },
  B1: { id: "sess-row-B1", accountId: ACCOUNTS.B.id, createdAt: ACCOUNTS.B.createdAt },
  C1: { id: "sess-row-C1", accountId: ACCOUNTS.C.id, createdAt: ACCOUNTS.C.createdAt },
} as const;

// ---------------------------------------------------------------------------
// Content descriptors (consumed by admin-content-repo.oracle.test.ts)
// ---------------------------------------------------------------------------

/** Saved conversations seeded per account (cross-account browser, ADMIN-US-9). */
export const CONVERSATIONS = {
  A1: { id: "conv-A1", accountId: ACCOUNTS.A.id, title: "Garchomp speed", format: "scarlet-violet" },
  A2: { id: "conv-A2", accountId: ACCOUNTS.A.id, title: "Tera type math", format: "champions" },
  B1: { id: "conv-B1", accountId: ACCOUNTS.B.id, title: "Rain team help", format: "scarlet-violet" },
} as const;

/** Saved teams seeded per account (cross-account browser, ADMIN-US-10). */
export const TEAMS = {
  /** ash — a 1-member (incomplete) standard team. */
  A1: { id: "team-A1", accountId: ACCOUNTS.A.id, name: "Sun Team", format: "scarlet-violet" },
  /** misty — a full, COMPLETE 6-pack Champions team. */
  B1: { id: "team-B1", accountId: ACCOUNTS.B.id, name: "Rain Core", format: "champions" },
} as const;

/** Live-view expectations (getLive); see the LIVE rows below. */
export const LIVE = {
  /** Most-recent turn (LIVE_NOW − 5 min) → recent[0]. */
  topSession: "sess-LIVE1",
  topModel: "grok-4.3",
  topInput: 1000,
  topOutput: 200,
  topThinking: 0,
  /** last-hour window: LIVE1 (−5m) + LIVE2 (−30m); LIVE3 (−90m) is outside. */
  expectedLastHourTurns: 2,
  expectedLastHourActive: 2,
} as const;

/** Total turn_record rows: 12 in-range + 2 out-of-range + 3 live + 2 tie = 19. */
export const TOTAL_TURN_RECORDS = 19;

// ---------------------------------------------------------------------------
// Tool-trace helpers
// ---------------------------------------------------------------------------

function okCall(tool: string): ToolTraceEntry {
  return { tool, args: {}, latency_ms: 8, cache_hit: true, error: null };
}
function errCall(tool: string, error = "index_unavailable"): ToolTraceEntry {
  return { tool, args: {}, latency_ms: 11, cache_hit: false, error };
}

// ---------------------------------------------------------------------------
// Turn spec → turn_record row
// ---------------------------------------------------------------------------

interface TurnSpec {
  id: string;
  sessionId: string;
  accountId: string | null;
  model: string | null;
  providerModel: string | null;
  mode?: "standard" | "champions";
  status: string;
  inTok: number;
  outTok: number;
  thinkTok: number;
  tools?: ToolTraceEntry[];
  citations?: number;
  latency?: number;
  images?: number;
  prompt: string;
  answerText?: string | null;
  answer?: unknown;
  createdAt: number;
}

function turnRow(s: TurnSpec) {
  const tools = s.tools ?? [];
  const toolErrorCount = tools.filter((t) => t.error != null).length;
  const answered = s.status === "answered";
  return {
    id: s.id,
    session_id: s.sessionId,
    account_id: s.accountId,
    model: s.model,
    provider_model: s.providerModel,
    mode: s.mode ?? "standard",
    status: s.status,
    input_tokens: s.inTok,
    output_tokens: s.outTok,
    thinking_tokens: s.thinkTok,
    tool_trace: JSON.stringify(tools),
    tool_error_count: toolErrorCount,
    citation_count: s.citations ?? 0,
    turn_latency_ms: s.latency ?? 1000,
    images_count: s.images ?? 0,
    prompt_text: s.prompt,
    answer_text:
      s.answerText !== undefined ? s.answerText : answered ? "Answer." : null,
    answer_json:
      s.answer !== undefined
        ? s.answer == null
          ? null
          : JSON.stringify(s.answer)
        : answered
          ? JSON.stringify({ status: "answered", answer_markdown: "Answer." })
          : null,
    created_at: s.createdAt,
  };
}

// ---------------------------------------------------------------------------
// In-range turn specs (12), laid out by UTC day. Every row here belongs to an
// account (A/B/C) or an in-range guest session (G1..G4); see the header for the
// exact aggregates these produce over ADMIN_RANGE.
//
//   A (ash):   tr-01, tr-02, tr-07, tr-11   → 4 turns, all grok-4.3
//   B (misty): tr-06, tr-10                 → 2 turns, all gpt-5.5
//   C (brock): tr-05                         → 1 turn,  claude
//   guests:    tr-03/08 (G1), tr-04 (G2), tr-09 (G3), tr-12 (G4)
// ---------------------------------------------------------------------------

const A = ACCOUNTS.A.id;
const B = ACCOUNTS.B.id;
const C = ACCOUNTS.C.id;

const IN_RANGE: TurnSpec[] = [
  // --- Jan-5 (BASE): 5 turns — signed {A,C}=2, guest {G1,G2}=2, signups {A}=1
  {
    id: "tr-01",
    sessionId: "sess-A1",
    accountId: A,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 1000,
    outTok: 200,
    thinkTok: 50,
    tools: [okCall("resolve_entity")],
    citations: 2,
    prompt: "How fast is Garchomp?",
    // Distinctive answer text so the answer-text branch of `q` search is exercised
    // ("base 102 Speed" is in the ANSWER only, not the prompt).
    answerText: "Garchomp has base 102 Speed.",
    answer: { status: "answered", answer_markdown: "Garchomp has base 102 Speed." },
    createdAt: BASE + 1 * HOUR,
  },
  {
    id: "tr-02",
    sessionId: "sess-A1",
    accountId: A,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 500,
    outTok: 100,
    thinkTok: 0,
    // one tool error → counts toward the tool_error category (BR-9)
    tools: [okCall("resolve_entity"), errCall("get_pokemon")],
    citations: 1,
    prompt: "What is its ability?",
    createdAt: BASE + 2 * HOUR,
  },
  {
    // guest G1; mode champions (the only champions-mode turn) so the content
    // repo's mode filter has exactly one hit. Mode is not read by analytics.
    id: "tr-03",
    sessionId: "sess-G1",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    mode: "champions",
    status: "answered",
    inTok: 300,
    outTok: 80,
    thinkTok: 0,
    prompt: "Type chart for Ground?",
    createdAt: BASE + 3 * HOUR,
  },
  {
    id: "tr-04",
    sessionId: "sess-G2",
    accountId: null,
    model: "claude",
    providerModel: "claude-sonnet",
    status: "resolution_failed",
    inTok: 200,
    outTok: 0,
    thinkTok: 0,
    prompt: "asdkjhasd",
    createdAt: BASE + 4 * HOUR,
  },
  {
    id: "tr-05",
    sessionId: "sess-C1",
    accountId: C,
    model: "claude",
    providerModel: "claude-sonnet",
    status: "answered",
    inTok: 800,
    outTok: 150,
    thinkTok: 20,
    citations: 3,
    prompt: "Best wallbreaker?",
    createdAt: BASE + 5 * HOUR,
  },

  // --- Jan-6 (BASE+DAY): 4 turns — signed {B,A}=2, guest {G1,G3}=2, signups {B}=1
  {
    id: "tr-06",
    sessionId: "sess-B1",
    accountId: B,
    model: "gpt-5.5",
    providerModel: "gpt-5.5-2026",
    status: "answered",
    inTok: 1000,
    outTok: 300,
    thinkTok: 0,
    citations: 2,
    prompt: "Build me a rain team",
    createdAt: BASE + DAY + 1 * HOUR,
  },
  {
    id: "tr-07",
    sessionId: "sess-A2",
    accountId: A,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "clarification_needed",
    inTok: 100,
    outTok: 20,
    thinkTok: 0,
    prompt: "what about it",
    createdAt: BASE + DAY + 2 * HOUR,
  },
  {
    // SAME guest session as Jan-5 (sess-G1) → distinct-active is per-window:
    // counted in BOTH day buckets but ONCE in the range total.
    id: "tr-08",
    sessionId: "sess-G1",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 250,
    outTok: 60,
    thinkTok: 0,
    prompt: "and Flying?",
    createdAt: BASE + DAY + 3 * HOUR,
  },
  {
    // UNPRICED model → priced:false, estUsd contribution 0 (ADMIN-BR-5 / AD-6).
    id: "tr-09",
    sessionId: "sess-G3",
    accountId: null,
    model: "mystery",
    providerModel: "mystery-1",
    status: "answered",
    inTok: 400,
    outTok: 90,
    thinkTok: 0,
    prompt: "hello there",
    createdAt: BASE + DAY + 4 * HOUR,
  },

  // --- Jan-7 (BASE+2*DAY): 3 turns — signed {B,A}=2, guest {G4}=1, signups 0
  {
    id: "tr-10",
    sessionId: "sess-B1",
    accountId: B,
    model: "gpt-5.5",
    providerModel: "gpt-5.5-2026",
    status: "insufficient_data",
    inTok: 150,
    outTok: 0,
    thinkTok: 0,
    prompt: "obscure question",
    createdAt: BASE + 2 * DAY + 1 * HOUR,
  },
  {
    id: "tr-11",
    sessionId: "sess-A1",
    accountId: A,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 600,
    outTok: 120,
    thinkTok: 30,
    // two tool errors → still ONE turn in the tool_error category.
    tools: [errCall("get_pokemon"), errCall("get_move", "timeout")],
    citations: 1,
    prompt: "compare these two",
    createdAt: BASE + 2 * DAY + 2 * HOUR,
  },
  {
    // rate_limited (AD-4): no model resolved, no answer.
    id: "tr-12",
    sessionId: "sess-G4",
    accountId: null,
    model: null,
    providerModel: null,
    status: "rate_limited",
    inTok: 0,
    outTok: 0,
    thinkTok: 0,
    prompt: "spam spam spam",
    answerText: null,
    answer: null,
    createdAt: BASE + 2 * DAY + 3 * HOUR,
  },
];

// Out-of-range guest turns: verify [from, to) scoping — one BEFORE `from`, one
// EXACTLY at `to` (exclusive → excluded). GUESTS, so they never touch the
// per-account lifetime rollups the content repo computes.
const OUT_OF_RANGE: TurnSpec[] = [
  {
    id: "tr-before",
    sessionId: "sess-OUT0",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 9999,
    outTok: 9999,
    thinkTok: 9999,
    prompt: "before the window",
    createdAt: BASE - 1 * HOUR,
  },
  {
    id: "tr-at-to",
    sessionId: "sess-OUT-AT",
    accountId: null,
    model: "claude",
    providerModel: "claude-sonnet",
    status: "answered",
    inTok: 9999,
    outTok: 9999,
    thinkTok: 9999,
    prompt: "exactly at to (excluded)",
    createdAt: BASE + 3 * DAY,
  },
];

// Live-view guest rows at FIXED offsets from LIVE_NOW (the analytics suite pins
// Date.now() to LIVE_NOW). −5m / −30m fall in the last hour; −90m falls outside.
const LIVE_ROWS: TurnSpec[] = [
  {
    id: "tr-live-1",
    sessionId: "sess-LIVE1",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: LIVE.topInput,
    outTok: LIVE.topOutput,
    thinkTok: LIVE.topThinking,
    prompt: "live: most recent",
    createdAt: LIVE_NOW - 5 * MINUTE,
  },
  {
    id: "tr-live-2",
    sessionId: "sess-LIVE2",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 500,
    outTok: 100,
    thinkTok: 0,
    prompt: "live: 30m ago",
    createdAt: LIVE_NOW - 30 * MINUTE,
  },
  {
    id: "tr-live-3",
    sessionId: "sess-LIVE3",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 100,
    outTok: 50,
    thinkTok: 0,
    prompt: "live: 90m ago (outside window)",
    createdAt: LIVE_NOW - 90 * MINUTE,
  },
];

// Two guest turns sharing the SAME created_at (TIE_AT) → exercise the keyset
// id-tiebreak. DESC by (created_at, id): tr-tie-b before tr-tie-a.
const TIE_ROWS: TurnSpec[] = [
  {
    id: "tr-tie-a",
    sessionId: "sess-TIE",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 100,
    outTok: 10,
    thinkTok: 0,
    prompt: "tie row a",
    createdAt: TIE_AT,
  },
  {
    id: "tr-tie-b",
    sessionId: "sess-TIE",
    accountId: null,
    model: "grok-4.3",
    providerModel: "grok-2",
    status: "answered",
    inTok: 100,
    outTok: 10,
    thinkTok: 0,
    prompt: "tie row b",
    createdAt: TIE_AT,
  },
];

// ---------------------------------------------------------------------------
// Team members — one incomplete + one complete 6-pack.
// ---------------------------------------------------------------------------

const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** A full member (species + 4 moves) so a 6-pack reads "complete". */
function fullMember(species: string): TeamMember {
  return {
    species,
    ability: "intimidate",
    item: "leftovers",
    moves: ["tackle", "growl", "ember", "tail-whip"],
    nature: "adamant",
    evs: ZERO_EVS,
    ivs: MAX_IVS,
    tera_type: "normal",
    level: 50,
  };
}

const VENUSAUR: TeamMember = {
  species: "venusaur",
  ability: "chlorophyll",
  item: "life-orb",
  moves: ["solar-beam", "sludge-bomb", "growth", "weather-ball"],
  nature: "modest",
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  ivs: MAX_IVS,
  tera_type: "fire",
  level: 50,
};

/** The 6 species in team-B1's complete pack, in slot order. */
export const TEAM_B1_SPECIES = [
  "miraidon",
  "flutter-mane",
  "iron-hands",
  "chien-pao",
  "urshifu",
  "rillaboom",
] as const;

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedAccounts(db: AdminFixtureDb): Promise<void> {
  await db.insert(account).values([
    { id: ACCOUNTS.A.id, email: ACCOUNTS.A.email, created_at: ACCOUNTS.A.createdAt },
    { id: ACCOUNTS.B.id, email: ACCOUNTS.B.email, created_at: ACCOUNTS.B.createdAt },
    { id: ACCOUNTS.C.id, email: ACCOUNTS.C.email, created_at: ACCOUNTS.C.createdAt },
  ]);

  // Active sessions use a year-2286 expiry (always live); A also gets one
  // already-expired session (year-2025 expiry) that must be excluded from the
  // account-detail view (ADMIN-AC-8.3).
  await db.insert(auth_session).values([
    {
      id: SESSIONS.A1.id,
      token_hash: "th-A1",
      account_id: SESSIONS.A1.accountId,
      created_at: SESSIONS.A1.createdAt,
      expires_at: FAR_FUTURE,
    },
    {
      id: SESSIONS.A2.id,
      token_hash: "th-A2",
      account_id: SESSIONS.A2.accountId,
      created_at: SESSIONS.A2.createdAt,
      expires_at: FAR_FUTURE,
    },
    {
      id: SESSIONS.AExpired.id,
      token_hash: "th-A-exp",
      account_id: SESSIONS.AExpired.accountId,
      created_at: SESSIONS.AExpired.createdAt,
      expires_at: BASE + 2 * HOUR, // long past relative to any test clock
    },
    {
      id: SESSIONS.B1.id,
      token_hash: "th-B1",
      account_id: SESSIONS.B1.accountId,
      created_at: SESSIONS.B1.createdAt,
      expires_at: FAR_FUTURE,
    },
    {
      id: SESSIONS.C1.id,
      token_hash: "th-C1",
      account_id: SESSIONS.C1.accountId,
      created_at: SESSIONS.C1.createdAt,
      expires_at: FAR_FUTURE,
    },
  ]);
}

async function seedContent(db: AdminFixtureDb): Promise<void> {
  // Conversations: A has 2 (one per format), B has 1, C has none.
  await db.insert(conversation).values([
    {
      id: CONVERSATIONS.A1.id,
      account_id: CONVERSATIONS.A1.accountId,
      title: CONVERSATIONS.A1.title,
      format: CONVERSATIONS.A1.format,
      pinned: 0,
      created_at: BASE + HOUR,
      updated_at: BASE + 2 * HOUR,
    },
    {
      id: CONVERSATIONS.A2.id,
      account_id: CONVERSATIONS.A2.accountId,
      title: CONVERSATIONS.A2.title,
      format: CONVERSATIONS.A2.format,
      pinned: 0,
      created_at: BASE + DAY,
      updated_at: BASE + DAY + HOUR,
    },
    {
      id: CONVERSATIONS.B1.id,
      account_id: CONVERSATIONS.B1.accountId,
      title: CONVERSATIONS.B1.title,
      format: CONVERSATIONS.B1.format,
      pinned: 0,
      created_at: BASE + DAY + HOUR,
      updated_at: BASE + DAY + 2 * HOUR,
    },
  ]);

  await db.insert(conversation_message).values([
    // conv-A1 — 2 turns (assistant message carries the searchable "Garchomp" text)
    {
      id: "msg-A1-0",
      conversation_id: CONVERSATIONS.A1.id,
      account_id: ACCOUNTS.A.id,
      seq: 0,
      role: "user",
      text_content: "How fast is Garchomp?",
      answer_json: null,
      created_at: BASE + HOUR,
    },
    {
      id: "msg-A1-1",
      conversation_id: CONVERSATIONS.A1.id,
      account_id: ACCOUNTS.A.id,
      seq: 1,
      role: "assistant",
      text_content: "Garchomp has base 102 Speed.",
      answer_json: JSON.stringify({
        status: "answered",
        answer_markdown: "Garchomp has base 102 Speed.",
      }),
      created_at: BASE + HOUR + 1000,
    },
    // conv-A2 — 2 turns
    {
      id: "msg-A2-0",
      conversation_id: CONVERSATIONS.A2.id,
      account_id: ACCOUNTS.A.id,
      seq: 0,
      role: "user",
      text_content: "Tera type math for Fairy?",
      answer_json: null,
      created_at: BASE + DAY,
    },
    {
      id: "msg-A2-1",
      conversation_id: CONVERSATIONS.A2.id,
      account_id: ACCOUNTS.A.id,
      seq: 1,
      role: "assistant",
      text_content: "Tera Fairy changes the defensive profile.",
      answer_json: JSON.stringify({
        status: "answered",
        answer_markdown: "Tera Fairy changes the defensive profile.",
      }),
      created_at: BASE + DAY + 1000,
    },
    // conv-B1 — 2 turns (assistant message carries the searchable "rain core" text)
    {
      id: "msg-B1-0",
      conversation_id: CONVERSATIONS.B1.id,
      account_id: ACCOUNTS.B.id,
      seq: 0,
      role: "user",
      text_content: "Build me a rain team",
      answer_json: null,
      created_at: BASE + DAY + HOUR,
    },
    {
      id: "msg-B1-1",
      conversation_id: CONVERSATIONS.B1.id,
      account_id: ACCOUNTS.B.id,
      seq: 1,
      role: "assistant",
      text_content: "Here is a rain core.",
      answer_json: JSON.stringify({
        status: "answered",
        answer_markdown: "Here is a rain core.",
      }),
      created_at: BASE + DAY + HOUR + 1000,
    },
  ]);

  // Teams: A has a 1-member (incomplete) team; B has a complete 6-pack; C none.
  await db.insert(team).values([
    {
      id: TEAMS.A1.id,
      account_id: TEAMS.A1.accountId,
      format: TEAMS.A1.format,
      name: TEAMS.A1.name,
      members: JSON.stringify([VENUSAUR]),
      created_at: BASE + 2 * HOUR,
      updated_at: BASE + 2 * HOUR,
    },
    {
      id: TEAMS.B1.id,
      account_id: TEAMS.B1.accountId,
      format: TEAMS.B1.format,
      name: TEAMS.B1.name,
      members: JSON.stringify(TEAM_B1_SPECIES.map(fullMember)),
      created_at: BASE + DAY + 2 * HOUR,
      updated_at: BASE + DAY + 2 * HOUR,
    },
  ]);
}

async function seedAuthEvents(db: AdminFixtureDb): Promise<void> {
  await db.insert(auth_event).values([
    {
      id: "ae-req-1",
      type: "otp_requested",
      email: ACCOUNTS.A.email,
      account_id: null,
      created_flag: null,
      detail: null,
      created_at: BASE + 30 * MINUTE,
    },
    {
      id: "ae-ver-signup",
      type: "otp_verified",
      email: ACCOUNTS.A.email,
      account_id: ACCOUNTS.A.id,
      created_flag: 1, // new signup
      detail: null,
      created_at: BASE + HOUR,
    },
    {
      id: "ae-ver-signin",
      type: "otp_verified",
      email: ACCOUNTS.A.email,
      account_id: ACCOUNTS.A.id,
      created_flag: 0, // returning sign-in
      detail: null,
      created_at: BASE + DAY,
    },
    {
      // IN range → counts toward the otp_email_failed error category (BR-9).
      id: "ae-fail-in",
      type: "otp_email_failed",
      email: "bounce@nowhere.test",
      account_id: null,
      created_flag: null,
      detail: JSON.stringify({ error: "smtp 550" }),
      created_at: BASE + 6 * HOUR,
    },
    {
      // BEFORE range → must NOT count.
      id: "ae-fail-out",
      type: "otp_email_failed",
      email: "bounce2@nowhere.test",
      account_id: null,
      created_flag: null,
      detail: JSON.stringify({ error: "smtp 550" }),
      created_at: BASE - 2 * HOUR,
    },
  ]);
}

/**
 * Seed the full admin fixture into the given (freshly migrated, empty) schema.
 * Call once per fixture — both oracle tests do `createPgSchema({ seed: "none" })`
 * then `seedAdminFixture(fix.db)` after `installAsSingleton`.
 */
export async function seedAdminFixture(db: AdminFixtureDb): Promise<void> {
  await seedAccounts(db);
  await seedContent(db);
  await db
    .insert(turn_record)
    .values(
      [...IN_RANGE, ...OUT_OF_RANGE, ...LIVE_ROWS, ...TIE_ROWS].map(turnRow),
    );
  await seedAuthEvents(db);
}
