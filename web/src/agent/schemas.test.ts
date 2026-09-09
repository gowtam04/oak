/**
 * Unit tests for the team-builder additions to the agent schema contract
 * (src/agent/schemas.ts): the additive `proposed_team` field on the `.strict()`
 * OakAnswer (TEAM-AD-6) and the team-lookup tool I/O (`get_team` / `list_teams`).
 *
 * Pure schema tests — no DB / server-only (schemas.ts pulls only the shared
 * team-schema and a type-only EnrichedActiveTeam import).
 *
 * Focus:
 *   - backward-compat: a stored answer_json WITHOUT proposed_team still parses;
 *   - a valid proposed_team parses; an unknown key / bad format is rejected;
 *   - get_team takes a `team_id` and list_teams takes no args; both are in
 *     TOOL_NAMES with strict input schemas.
 */

import { describe, expect, it } from "vitest";
import type { SafeParseReturnType } from "zod";

import {
  oakAnswerSchema,
  getTeamInputSchema,
  listTeamsInputSchema,
  getPokemonOutputSchema,
  getEvolutionChainOutputSchema,
  TOOL_NAMES,
  toolInputJsonSchemas,
  TYPE_DISPLAY_ORDER,
  TYPE_NAMES,
  typeDisplayIndex,
  type OakAnswer,
} from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";

/** A minimal valid OakAnswer (the pre-team-builder required surface). */
const BASE_ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "Bottom line.",
  reasoning_markdown: "Because.",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

const MEMBER: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake", "dragon-claw"],
  nature: "jolly",
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: "fire",
  level: 50,
};

describe("oakAnswerSchema — proposed_team (TEAM-AD-6)", () => {
  it("parses a stored answer WITHOUT proposed_team (backward compatible)", () => {
    const parsed = oakAnswerSchema.safeParse(BASE_ANSWER);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proposed_team).toBeUndefined();
    }
  });

  it("parses an answer carrying a valid proposed_team", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      proposed_team: {
        name: "Rain Offense",
        format: "scarlet-violet",
        members: [MEMBER],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts every FORMATS member in proposed_team.format and rejects an unknown one", () => {
    // National Dex scope feature widened FORMATS to 11 entries (national-dex +
    // gen-1..gen-4 reference builds are now permissive proposed_team formats).
    for (const format of [
      "scarlet-violet",
      "champions",
      "national-dex",
      "gen-1",
    ] as const) {
      const parsed = oakAnswerSchema.safeParse({
        ...BASE_ANSWER,
        proposed_team: { name: "T", format, members: [] },
      });
      expect(parsed.success).toBe(true);
    }
    const bad = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      proposed_team: { name: "T", format: "gen-9", members: [] },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown key inside proposed_team (.strict())", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      proposed_team: {
        name: "T",
        format: "scarlet-violet",
        members: [],
        notes: "nope",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("still rejects unknown TOP-LEVEL keys (the answer stays strict)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      not_a_field: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("oakAnswerSchema — proposed_team_warnings (server-stamped, BR-T5)", () => {
  it("parses a stored answer WITHOUT proposed_team_warnings (backward compatible)", () => {
    const parsed = oakAnswerSchema.safeParse(BASE_ANSWER);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proposed_team_warnings).toBeUndefined();
    }
  });

  it("parses an answer carrying a species_illegal warning", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      proposed_team: { name: "T", format: "champions", members: [MEMBER] },
      proposed_team_warnings: [
        {
          code: "species_illegal",
          message: 'Species "heatran" is not legal in this format.',
          slot: 0,
          field: "species",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proposed_team_warnings?.[0]?.code).toBe(
        "species_illegal",
      );
    }
  });

  it("rejects an unknown warning code (.strict() enum)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      proposed_team_warnings: [{ code: "not_a_code", message: "x" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("tool output schemas — no exists_in_standard (ADR-8, CF-DATA-BR-5)", () => {
  it("getPokemonOutputSchema parses a miss without exists_in_standard", () => {
    const parsed = getPokemonOutputSchema.safeParse({
      found: false,
      suggestions: ["garchomp"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("exists_in_standard");
  });

  it("getPokemonOutputSchema does not keep exists_in_standard on a miss", () => {
    const parsed = getPokemonOutputSchema.safeParse({
      found: false,
      suggestions: ["garchomp"],
      exists_in_standard: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("exists_in_standard");
  });

  it("getEvolutionChainOutputSchema parses a miss without source_format / exists_in_standard", () => {
    const parsed = getEvolutionChainOutputSchema.safeParse({
      found: false,
      suggestions: [],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("source_format");
    expect(parsed.data).not.toHaveProperty("exists_in_standard");
  });

  it("getEvolutionChainOutputSchema does not keep source_format on a Champions miss", () => {
    const parsed = getEvolutionChainOutputSchema.safeParse({
      found: false,
      suggestions: [],
      source_format: "scarlet-violet",
      exists_in_standard: false,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("source_format");
    expect(parsed.data).not.toHaveProperty("exists_in_standard");
  });
});

describe("team-lookup I/O (get_team T12, list_teams T16)", () => {
  it("registers get_team and list_teams in TOOL_NAMES and toolInputJsonSchemas", () => {
    expect(TOOL_NAMES).toContain("get_team");
    expect(TOOL_NAMES).toContain("list_teams");
    expect(toolInputJsonSchemas.get_team).toBeDefined();
    expect(toolInputJsonSchemas.list_teams).toBeDefined();
    // The retired server-bound tool is gone from the contract.
    expect(TOOL_NAMES).not.toContain("get_active_team");
  });

  it("TOOL_NAMES is the 17 remaining Champions tools in architecture order (ADR-2)", () => {
    expect(TOOL_NAMES).toEqual([
      "resolve_entity",
      "query_pokedex",
      "get_pokemon",
      "get_move",
      "get_ability",
      "get_type_matchups",
      "get_evolution_chain",
      "get_item",
      "compute_stat",
      "estimate_damage",
      "submit_answer",
      "get_team",
      "save_team",
      "get_usage_stats",
      "list_teams",
      "get_learnset",
      "lookup_box",
    ]);
    for (const removed of [
      "get_encounters",
      "run_sql",
      "search_wiki",
      "get_meta_usage",
    ]) {
      expect(TOOL_NAMES).not.toContain(removed);
      expect(
        (toolInputJsonSchemas as Record<string, unknown>)[removed],
      ).toBeUndefined();
    }
  });

  it("get_team requires a non-empty team_id and rejects strays", () => {
    expect(getTeamInputSchema.safeParse({ team_id: "t_rain" }).success).toBe(
      true,
    );
    expect(getTeamInputSchema.safeParse({}).success).toBe(false);
    expect(getTeamInputSchema.safeParse({ team_id: "" }).success).toBe(false);
    expect(
      getTeamInputSchema.safeParse({ team_id: "t_rain", extra: 1 }).success,
    ).toBe(false);
  });

  it("list_teams accepts {} and rejects any argument", () => {
    expect(listTeamsInputSchema.safeParse({}).success).toBe(true);
    expect(listTeamsInputSchema.safeParse({ name: "rain" }).success).toBe(false);
  });
});

describe("TYPE_DISPLAY_ORDER / typeDisplayIndex (Champions display order)", () => {
  it("is a permutation of TYPE_NAMES (same 18 members, presentation order only)", () => {
    expect(TYPE_DISPLAY_ORDER).toHaveLength(18);
    expect(new Set(TYPE_DISPLAY_ORDER).size).toBe(TYPE_DISPLAY_ORDER.length);
    expect(new Set(TYPE_DISPLAY_ORDER)).toEqual(new Set(TYPE_NAMES));
  });

  it("starts with the Champions order normal, grass, fire, water", () => {
    expect(TYPE_DISPLAY_ORDER.slice(0, 4)).toEqual([
      "normal",
      "grass",
      "fire",
      "water",
    ]);
  });

  it("returns the slot index; unknown/empty sorts last", () => {
    expect(typeDisplayIndex("normal")).toBe(0);
    expect(typeDisplayIndex("grass")).toBe(1);
    expect(typeDisplayIndex("fire")).toBe(2);
    expect(typeDisplayIndex("water")).toBe(3);
    expect(typeDisplayIndex("fairy")).toBe(17);
    expect(typeDisplayIndex("")).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeDisplayIndex("notatype")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("submit_answer JSON Schema — xAI strict-safe (P3a)", () => {
  // xAI tool-call arguments are ALWAYS implicitly strict; its validator can
  // reject an open `additionalProperties: {}` (what z.record(z.unknown())
  // generates). The free-form maps (candidate key_stats, damage_calc
  // assumptions/result) are typed as JSON scalars so they emit a CONCRETE
  // additionalProperties schema instead. Guard that no bare `{}` map remains.
  it("has no bare `additionalProperties: {}` anywhere", () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${path}[${i}]`));
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      const ap = obj.additionalProperties;
      if (
        ap !== null &&
        typeof ap === "object" &&
        !Array.isArray(ap) &&
        Object.keys(ap as object).length === 0
      ) {
        offenders.push(`${path}.additionalProperties`);
      }
      for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
    };
    walk(toolInputJsonSchemas.submit_answer, "submit_answer");
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// citation.anchor + origin (answer-cards P1; CIT-US-2, CIT-AC-2.2, VOICE-AC-1.2)
// Additive optional fields on the existing .strict() schemas. Invalid anchors
// are the sanitize gate (CIT-BR-3), not a schema reject — see
// sanitize-citation-anchors.test.ts.
// ---------------------------------------------------------------------------

describe("oakAnswerSchema — citation.anchor (CIT-US-2, CIT-AC-2.2)", () => {
  it("parses a stored answer WITHOUT citation.anchor (CIT-AC-2.2 backward compatible)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      citations: [{ source: "pokemon/garchomp", detail: "base Speed 102" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.citations[0]).not.toHaveProperty("anchor");
    }
  });

  it("parses a valid answer_span anchor (CIT-US-2)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      citations: [
        {
          source: "pokemon/garchomp",
          detail: "base Speed 102",
          anchor: { target: "answer_span", id: "c0" },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const citation = parsed.data.citations[0] as { anchor?: unknown };
      expect(citation.anchor).toEqual({
        target: "answer_span",
        id: "c0",
      });
    }
  });

  it("parses a valid fact_row anchor (CIT-US-2)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      citations: [
        {
          source: "pokemon/garchomp",
          detail: "base Speed 102",
          anchor: { target: "fact_row", id: "Garchomp" },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const citation = parsed.data.citations[0] as { anchor?: unknown };
      expect(citation.anchor).toEqual({
        target: "fact_row",
        id: "Garchomp",
      });
    }
  });

  it("still parses an unmapped citation — missing link is not a failed turn (CIT-AC-2.1, CIT-BR-3)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      citations: [{ source: "pokemon/garchomp", detail: "base Speed 102" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("oakAnswerSchema — origin (VOICE-AC-1.2)", () => {
  it("parses a stored answer WITHOUT origin (backward compatible)", () => {
    const parsed = oakAnswerSchema.safeParse(BASE_ANSWER);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { origin?: unknown }).origin).toBeUndefined();
    }
  });

  it("parses origin: \"voice\" (server-stamped voice card)", () => {
    const parsed = oakAnswerSchema.safeParse({
      ...BASE_ANSWER,
      origin: "voice",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { origin?: unknown }).origin).toBe("voice");
    }
  });
});

// ---------------------------------------------------------------------------
// lookup_box (T22, team-from-box)
// BOX-AC-3.2 bulk names, BOX-AC-3.4 compact moves, BOX-BR-5 short-path lookup,
// BOX-BR-7 get_learnset stays the full-movepool API (last two barrel names).
// ---------------------------------------------------------------------------

/** Canonical get_pokemon hit (tools.md T3) — lookup_box embeds this as `pokemon`. */
const FARIGIRAF_PROFILE = {
  found: true,
  display_name: "Farigiraf",
  national_dex_number: 981,
  types: ["normal", "psychic"],
  abilities: {
    slot1: "cud-chew",
    slot2: "armor-tail",
    hidden: "sap-sipper",
  },
  base_stats: {
    hp: 120,
    attack: 90,
    defense: 70,
    special_attack: 110,
    special_defense: 70,
    speed: 60,
  },
  base_stat_total: 520,
  sprite_url: "https://.../981.png",
  artwork_url: "https://.../981_official.png",
  forms: ["farigiraf"],
  is_gen9_native: true,
  source_generation: null,
};

type ZodSafeParse = {
  safeParse: (v: unknown) => SafeParseReturnType<unknown, unknown>;
};

async function loadLookupBoxSchemas(): Promise<{
  lookupBoxInputSchema: ZodSafeParse;
  lookupBoxOutputSchema: ZodSafeParse;
}> {
  const schemas = (await import("@/agent/schemas")) as Record<string, unknown>;
  const lookupBoxInputSchema = schemas.lookupBoxInputSchema as
    | ZodSafeParse
    | undefined;
  const lookupBoxOutputSchema = schemas.lookupBoxOutputSchema as
    | ZodSafeParse
    | undefined;
  if (!lookupBoxInputSchema || !lookupBoxOutputSchema) {
    throw new Error(
      "Expected lookupBoxInputSchema and lookupBoxOutputSchema exports from src/agent/schemas.ts",
    );
  }
  return { lookupBoxInputSchema, lookupBoxOutputSchema };
}

describe("lookup_box I/O (T22, BOX-AC-3.2, BOX-BR-5, BOX-BR-7)", () => {
  it("appends lookup_box as the last TOOL_NAMES entry of the 17-tool barrel", () => {
    expect(TOOL_NAMES[15]).toBe("get_learnset");
    expect(TOOL_NAMES[16]).toBe("lookup_box");
    expect(TOOL_NAMES.at(-1)).toBe("lookup_box");
    expect(
      (toolInputJsonSchemas as Record<string, unknown>).lookup_box,
    ).toBeDefined();
  });

  it("lookupBoxInputSchema requires 1–40 non-empty names", async () => {
    const { lookupBoxInputSchema } = await loadLookupBoxSchemas();
    expect(lookupBoxInputSchema.safeParse({ names: ["Garchomp"] }).success).toBe(
      true,
    );
    expect(
      lookupBoxInputSchema.safeParse({
        names: Array.from({ length: 40 }, () => "Garchomp"),
      }).success,
    ).toBe(true);

    expect(lookupBoxInputSchema.safeParse({ names: [] }).success).toBe(false);
    expect(lookupBoxInputSchema.safeParse({ names: [""] }).success).toBe(false);
    expect(
      lookupBoxInputSchema.safeParse({
        names: Array.from({ length: 41 }, () => "Garchomp"),
      }).success,
    ).toBe(false);
    expect(lookupBoxInputSchema.safeParse({}).success).toBe(false);
  });

  it("lookupBoxInputSchema rejects an extra key (.strict())", async () => {
    const { lookupBoxInputSchema } = await loadLookupBoxSchemas();
    expect(
      lookupBoxInputSchema.safeParse({ names: ["Garchomp"], extra: 1 }).success,
    ).toBe(false);
  });

  it("lookupBoxOutputSchema accepts a found hit with unavailable learnset (empty movepool is not a miss)", async () => {
    const { lookupBoxOutputSchema } = await loadLookupBoxSchemas();
    const parsed = lookupBoxOutputSchema.safeParse({
      format: "scarlet-violet",
      truncated_input: false,
      results: [
        {
          query: "kangaskhan-mega",
          found: true,
          pokemon: FARIGIRAF_PROFILE,
          learnset: {
            available: false,
            count: 0,
            truncated: false,
            compact_moves: [],
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("lookupBoxOutputSchema accepts a miss with suggestions and does not require exists_in_standard", async () => {
    const { lookupBoxOutputSchema } = await loadLookupBoxSchemas();
    const parsed = lookupBoxOutputSchema.safeParse({
      format: "champions",
      truncated_input: false,
      results: [
        {
          query: "garchom",
          found: false,
          suggestions: ["garchomp"],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const miss = (parsed.data as { results: Array<Record<string, unknown>> })
      .results[0];
    expect(miss).not.toHaveProperty("exists_in_standard");
  });

  it("lookupBoxOutputSchema does not keep exists_in_standard on a miss (ADR-8, CF-DATA-BR-5)", async () => {
    const { lookupBoxOutputSchema } = await loadLookupBoxSchemas();
    const parsed = lookupBoxOutputSchema.safeParse({
      format: "champions",
      truncated_input: false,
      results: [
        {
          query: "excadrill",
          found: false,
          suggestions: ["garchomp"],
          exists_in_standard: true,
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const miss = (parsed.data as { results: Array<Record<string, unknown>> })
      .results[0];
    expect(miss).not.toHaveProperty("exists_in_standard");
  });

  it("lookupBoxOutputSchema accepts compact_moves with null detail fields", async () => {
    const { lookupBoxOutputSchema } = await loadLookupBoxSchemas();
    const parsed = lookupBoxOutputSchema.safeParse({
      format: "scarlet-violet",
      truncated_input: true,
      results: [
        {
          query: "Garchomp",
          found: true,
          pokemon: FARIGIRAF_PROFILE,
          learnset: {
            available: true,
            count: 3,
            truncated: false,
            compact_moves: [
              {
                slug: "earthquake",
                method: "machine",
                type: "ground",
                category: "physical",
                power: 100,
              },
              {
                slug: "dragon-claw",
                method: "level-up",
                type: null,
                category: null,
                power: null,
              },
            ],
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
