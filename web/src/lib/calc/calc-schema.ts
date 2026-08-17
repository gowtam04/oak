/**
 * Portable Zod contracts for `POST /api/calc` (CALC-US-4/5, api-design.md).
 *
 * Client-safe: no `server-only`, no db/repos. Incomplete sides (missing
 * species / move identity) still parse so the engine can return a 200
 * `{ ok: false, error: "incomplete" }` instead of a schema 400 (CALC-BR-8).
 */

import { z } from "zod";

import { FORMATS } from "@/data/formats";

export const calcFormatSchema = z.enum(FORMATS);

/** Accepted EV/IV keys: abbreviated competitive slugs and the long StatKeys. */
export const calcStatKeySchema = z.enum([
  "hp",
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
]);

export const calcEvIvSchema = z.record(calcStatKeySchema, z.number().int());

export const calcSideSchema = z.object({
  species: z.string().optional(),
  ability: z.string().nullable().optional(),
  item: z.string().nullable().optional(),
  nature: z.string().nullable().optional(),
  evs: calcEvIvSchema.optional(),
  ivs: calcEvIvSchema.optional(),
  tera: z.string().nullable().optional(),
  level: z.number().int().min(1).max(100).optional(),
});

export const calcMoveSchema = z.object({
  slug: z.string().optional(),
  name: z.string().optional(),
  power: z.number().optional(),
  type: z.string().optional(),
  category: z.enum(["physical", "special", "status"]).optional(),
});

export const calcFieldSchema = z.object({
  weather: z.enum(["none", "sun", "rain", "sand", "snow"]).optional(),
  reflect: z.boolean().optional(),
  light_screen: z.boolean().optional(),
});

export const calcScenarioSchema = z.object({
  format: calcFormatSchema,
  attacker: calcSideSchema,
  defender: calcSideSchema,
  move: calcMoveSchema,
  field: calcFieldSchema.optional(),
});

export const calcKoSchema = z.object({
  hits: z.number(),
});

export const calcSpreadEstimateSchema = z.object({
  min_damage: z.number(),
  max_damage: z.number(),
  percent_min: z.number(),
  percent_max: z.number(),
  ko: calcKoSchema,
});

export const calcEstimateSchema = calcSpreadEstimateSchema.extend({
  is_estimate: z.literal(true),
});

export const calcAppliedSchema = z.object({
  stab: z.boolean(),
  type_effectiveness: z.number(),
  other_modifier: z.number(),
  weather: z.string().optional(),
  screens: z.array(z.string()).optional(),
  item: z.string().optional(),
  unsupported: z.array(z.string()),
});

export const calcCommonSpreadSchema = z.object({
  label: z.enum(["min", "bulky", "max"]),
  estimate: calcSpreadEstimateSchema,
});

export const calcSuccessSchema = z.object({
  ok: z.literal(true),
  format: calcFormatSchema,
  estimate: calcEstimateSchema,
  breakdown: z.string(),
  applied: calcAppliedSchema,
  common_spreads: z.array(calcCommonSpreadSchema).optional(),
  caveat: z.string().optional(),
});

export const calcErrorCodeSchema = z.enum([
  "incomplete",
  "unresolved",
  "index_unavailable",
  "status_move",
]);

export const calcErrorSchema = z.object({
  ok: z.literal(false),
  error: calcErrorCodeSchema,
  detail: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
});

export const calcResultSchema = z.discriminatedUnion("ok", [
  calcSuccessSchema,
  calcErrorSchema,
]);

export type CalcStatKey = z.infer<typeof calcStatKeySchema>;
export type CalcSide = z.infer<typeof calcSideSchema>;
export type CalcMove = z.infer<typeof calcMoveSchema>;
export type CalcField = z.infer<typeof calcFieldSchema>;
export type CalcScenario = z.infer<typeof calcScenarioSchema>;
export type CalcEstimate = z.infer<typeof calcEstimateSchema>;
export type CalcSpreadEstimate = z.infer<typeof calcSpreadEstimateSchema>;
export type CalcApplied = z.infer<typeof calcAppliedSchema>;
export type CalcSuccess = z.infer<typeof calcSuccessSchema>;
export type CalcError = z.infer<typeof calcErrorSchema>;
export type CalcResult = z.infer<typeof calcResultSchema>;
