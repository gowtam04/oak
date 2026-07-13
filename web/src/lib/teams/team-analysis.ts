/**
 * team-analysis — CLIENT-SAFE wire contract for `POST /api/teams/analyze`.
 *
 * This module is the ONE definition every client (web panel, iOS, Android) builds
 * to, so it is CLIENT-SAFE (pure Zod + inferred types, no `server-only`, no
 * db/repos/env) — mirroring `@/lib/entity-artifact`. The endpoint takes a draft
 * team `{ format, members }` (members reusing the single-source team-member
 * schema) and returns a `TeamAnalysisResponse`:
 *
 *   - `ok`          — the full analysis (per-member stats, defensive matrix,
 *                     offensive coverage, speed tiers, roles, threats, notes).
 *   - `unavailable` — the format's index is unbuilt / unreadable (honest failure,
 *                     never fabricated data).
 *
 * A malformed body is a real HTTP 400 (an `{ error }` object, NOT an envelope);
 * both success statuses ride a 200 (the client switches on `status`).
 *
 * Contract shape notes (canonical for the mobile ports):
 *   - `defense` carries one row per battle type of the format's chart, each with
 *     member-slug ARRAYS (`weak` / `resists` / `immune`) — counts derive
 *     client-side from array lengths (gen-1's 15-type chart simply omits
 *     dark/steel/fairy rows; Champions uses the full 18-type chart).
 *   - Defense is ability/item-aware for a curated set (Levitate, Flash Fire, …).
 *   - `offense.covered[].by` names the `{ member, move }` slug pairs that make a
 *     type super-effectively covered; `uncovered` lists battle types no damaging
 *     move hits super-effectively.
 *   - Unresolved species degrade PER-MEMBER (`{ slug, found: false }`), never
 *     failing the whole call.
 *   - Additive fields (`roles*`, `physical_special`, `threats`, `defense_notes`)
 *     are optional on older clients; new clients should render them.
 */

import { z } from "zod";

import { FORMATS } from "@/data/formats";
import { teamMembersSchema } from "@/data/teams/team-schema";

/** Data scope — the full `Format` set (reused from the pure formats module). */
export const analysisFormatSchema = z.enum(FORMATS);

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** `POST /api/teams/analyze` request body. */
export const teamAnalysisRequestSchema = z.object({
  format: analysisFormatSchema,
  members: teamMembersSchema,
});

export type TeamAnalysisRequest = z.infer<typeof teamAnalysisRequestSchema>;

// ---------------------------------------------------------------------------
// Response leaf shapes
// ---------------------------------------------------------------------------

/** A member's six computed final stats; `null` where it couldn't be computed. */
export const analyzedStatsSchema = z.object({
  hp: z.number().nullable(),
  atk: z.number().nullable(),
  def: z.number().nullable(),
  spa: z.number().nullable(),
  spd: z.number().nullable(),
  spe: z.number().nullable(),
});

export type AnalyzedStats = z.infer<typeof analyzedStatsSchema>;

/**
 * One analyzed member. A resolved species carries its full readout; an
 * unresolved one degrades to `{ slug, found: false }` (never fails the call).
 * `slug` is the member's species slug (`""` when the slot had no species).
 */
export const analyzedMemberSchema = z.union([
  z.object({
    slug: z.string(),
    found: z.literal(true),
    display_name: z.string(),
    types: z.array(z.string()),
    bst: z.number(),
    stats: analyzedStatsSchema,
    level: z.number(),
    nature: z.string().nullable(),
  }),
  z.object({
    slug: z.string(),
    found: z.literal(false),
  }),
]);

export type AnalyzedMember = z.infer<typeof analyzedMemberSchema>;

/**
 * One row of the defensive matrix: for the attacking `type`, the member slugs
 * that are weak to / resist / immune to it. Counts derive from array lengths.
 */
export const defenseRowSchema = z.object({
  type: z.string(),
  weak: z.array(z.string()),
  resists: z.array(z.string()),
  immune: z.array(z.string()),
});

export type DefenseRow = z.infer<typeof defenseRowSchema>;

/** One super-effectively covered type and the `{ member, move }` pairs hitting it. */
export const offenseCoverageSchema = z.object({
  type: z.string(),
  by: z.array(z.object({ member: z.string(), move: z.string() })),
});

export type OffenseCoverage = z.infer<typeof offenseCoverageSchema>;

/** Offensive coverage: covered types (with their sources) + the uncovered rest. */
export const offenseSchema = z.object({
  covered: z.array(offenseCoverageSchema),
  uncovered: z.array(z.string()),
});

export type Offense = z.infer<typeof offenseSchema>;

/** One member's computed Speed, for the speed-tier ordering (sorted desc). */
export const speedTierSchema = z.object({
  member: z.string(),
  speed: z.number(),
});

export type SpeedTier = z.infer<typeof speedTierSchema>;

/** Per-member role/utility flags inferred from moves + ability. */
export const memberRolesSchema = z.object({
  member: z.string(),
  flags: z.array(z.string()),
});

export type MemberRolesWire = z.infer<typeof memberRolesSchema>;

/** Team-level physical vs special damaging-move balance. */
export const physicalSpecialSchema = z.object({
  physical_moves: z.number().int(),
  special_moves: z.number().int(),
  status_moves: z.number().int(),
  attacker_bias: z.enum(["physical", "special", "mixed", "none"]),
});

export type PhysicalSpecialWire = z.infer<typeof physicalSpecialSchema>;

/** One sample damage line vs a meta threat (Phase 4). */
export const threatCalcSchema = z.object({
  attacker: z.string(),
  defender: z.string(),
  move: z.string(),
  min_pct: z.number(),
  max_pct: z.number(),
});

export type ThreatCalcWire = z.infer<typeof threatCalcSchema>;

/**
 * One meta threat scored against the draft. Fail-soft empty when no ladder
 * snapshot exists for the team's format.
 */
export const threatRowSchema = z.object({
  species: z.string(),
  display_name: z.string(),
  usage_pct: z.number().optional(),
  rank: z.number().int().optional(),
  status: z.enum(["answered", "soft", "unanswered"]),
  reasons: z.array(z.string()),
  sample_calcs: z.array(threatCalcSchema).optional(),
});

export type ThreatRowWire = z.infer<typeof threatRowSchema>;

// ---------------------------------------------------------------------------
// Response envelope (ok | unavailable)
// ---------------------------------------------------------------------------

export const teamAnalysisOkSchema = z.object({
  status: z.literal("ok"),
  format: analysisFormatSchema,
  members: z.array(analyzedMemberSchema),
  defense: z.array(defenseRowSchema),
  offense: offenseSchema,
  speed_tiers: z.array(speedTierSchema),
  notes: z.array(z.string()),
  /** Per-member role flags (additive; empty array when no species). */
  roles: z.array(memberRolesSchema).default([]),
  roles_present: z.array(z.string()).default([]),
  roles_missing: z.array(z.string()).default([]),
  physical_special: physicalSpecialSchema.default({
    physical_moves: 0,
    special_moves: 0,
    status_moves: 0,
    attacker_bias: "none",
  }),
  /** Ability/item notes applied to the defensive matrix. */
  defense_notes: z.array(z.string()).default([]),
  /** Meta threat board (empty when no ladder data for this format). */
  threats: z.array(threatRowSchema).default([]),
  /** Ladder attribution, e.g. "Smogon gen9ou 2026-05". */
  meta_attribution: z.string().nullable().default(null),
});

export type TeamAnalysisOk = z.infer<typeof teamAnalysisOkSchema>;

/** Index unavailable — honest failure, never fabricated data. */
export const teamAnalysisUnavailableSchema = z.object({
  status: z.literal("unavailable"),
  format: analysisFormatSchema,
});

export type TeamAnalysisUnavailable = z.infer<
  typeof teamAnalysisUnavailableSchema
>;

/** The full response union returned by `POST /api/teams/analyze`. */
export const teamAnalysisResponseSchema = z.discriminatedUnion("status", [
  teamAnalysisOkSchema,
  teamAnalysisUnavailableSchema,
]);

export type TeamAnalysisResponse = z.infer<typeof teamAnalysisResponseSchema>;

/**
 * Residual analysis caveats after ability/item-aware defense landed.
 * Weather, terrain, dynamic items, and unlisted abilities are still omitted.
 */
export const ANALYSIS_RESIDUAL_CAVEAT =
  "Abilities/items outside the curated matchup table, weather, terrain, and dynamic effects are not fully modeled.";

/** @deprecated Prefer ANALYSIS_RESIDUAL_CAVEAT — kept for import compatibility. */
export const TYPE_ONLY_CAVEAT = ANALYSIS_RESIDUAL_CAVEAT;
