/**
 * Standalone damage-calc engine — resolve + computeStat + estimateDamage.
 *
 * No model (CALC-BR-1). Incomplete input never invents a 0 roll (CALC-BR-8).
 * Old gens (1–4) still run the modern formulas and return `caveat` (ADR-14).
 *
 * Common defensive spreads (CALC-AC-5.2) — only when defender EVs are omitted:
 *   min   — 0 HP / 0 Def (or SpD), neutral nature
 *   bulky — 252 HP / 252 Def (or SpD), neutral nature
 *   max   — 252 HP / 252 Def (or SpD), boosting nature on that defensive stat
 * The "defensive stat under test" is Def for physical moves and SpD for special.
 *
 * Does not statically import `server-only` modules (`@/data/db`, reference-cache)
 * so the engine test can load it without mocking `server-only`. The db handle
 * comes from an optional argument or `globalThis.__oakDb` (test singleton).
 */

import { and, eq, ilike } from "drizzle-orm";

import type { Format } from "@/data/formats";
import { ingest_meta, reference_cache, searchable_names } from "@/data/schema";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { normalizeName } from "@/data/repos/normalize-name";
import {
  computeStat,
  computeStatChampions,
  type ComputeStatResult,
} from "@/agent/formulas/compute-stat";
import { estimateDamage } from "@/agent/formulas/estimate-damage";
import {
  natureEffectFor,
  type NatureStat,
} from "@/agent/formulas/natures";
import type { MoveDetail, PokemonProfile } from "@/agent/schemas";
import { defaultCalcLevel } from "@/lib/calc/default-level";
import type {
  CalcApplied,
  CalcResult,
  CalcScenario,
  CalcSide,
  CalcSpreadEstimate,
  CalcStatKey,
} from "@/lib/calc/calc-schema";

import { resolveModifiers } from "./modifiers";

/** Avoid importing `@/data/db` (it is `server-only`); poke the repo's handle type. */
type CalcDb = Parameters<typeof getPokemon>[2];

const OLD_GEN_FORMATS = new Set<Format>(["gen-1", "gen-2", "gen-3", "gen-4"]);

type StatAbbrev = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

const STAT_ALIASES: Record<CalcStatKey, StatAbbrev> = {
  hp: "hp",
  atk: "atk",
  def: "def",
  spa: "spa",
  spd: "spd",
  spe: "spe",
  attack: "atk",
  defense: "def",
  special_attack: "spa",
  special_defense: "spd",
  speed: "spe",
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function readSpread(
  spread: Partial<Record<CalcStatKey, number>> | undefined,
  key: StatAbbrev,
  fallback: number,
  max: number,
): number {
  if (!spread) return fallback;
  for (const [raw, value] of Object.entries(spread)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const mapped = STAT_ALIASES[raw as CalcStatKey];
    if (mapped === key) return clamp(Math.round(value), 0, max);
  }
  return fallback;
}

function resolveDb(injected?: CalcDb): CalcDb {
  if (injected) return injected;
  const existing = (globalThis as { __oakDb?: { db: CalcDb } }).__oakDb?.db;
  if (existing) return existing;
  throw new Error("calc-engine: no database handle (pass db or install the singleton)");
}

async function indexAvailable(db: CalcDb, format: Format): Promise<boolean> {
  try {
    const rows = await db
      .select({ format: ingest_meta.format })
      .from(ingest_meta)
      .where(eq(ingest_meta.format, format))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function suggestSlugs(
  db: CalcDb,
  format: Format,
  kind: "pokemon" | "move",
  query: string,
): Promise<string[]> {
  const q = normalizeName(query);
  if (q.length === 0) return [];
  try {
    const rows = await db
      .select({ slug: searchable_names.slug })
      .from(searchable_names)
      .where(
        and(
          eq(searchable_names.format, format),
          eq(searchable_names.kind, kind),
          ilike(searchable_names.slug, `%${q}%`),
        ),
      )
      .limit(5);
    return rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

async function loadMove(
  db: CalcDb,
  format: Format,
  slug: string,
): Promise<MoveDetail | { found: false; suggestions: string[] }> {
  try {
    const rows = await db
      .select({ payload: reference_cache.payload })
      .from(reference_cache)
      .where(
        and(
          eq(reference_cache.format, format),
          eq(reference_cache.resource_key, `move/${slug}`),
        ),
      )
      .limit(1);
    const raw = rows[0]?.payload;
    if (raw) {
      const parsed = JSON.parse(raw) as MoveDetail;
      if (parsed && parsed.found === true) return parsed;
    }
  } catch {
    // miss
  }
  return { found: false, suggestions: await suggestSlugs(db, format, "move", slug) };
}

type OffensiveProfile = {
  super_effective_against: string[];
  not_very_effective_against: string[];
  no_effect_against: string[];
};

async function loadOffensive(
  db: CalcDb,
  format: Format,
  typeSlug: string,
): Promise<OffensiveProfile | null> {
  try {
    const rows = await db
      .select({ payload: reference_cache.payload })
      .from(reference_cache)
      .where(
        and(
          eq(reference_cache.format, format),
          eq(reference_cache.resource_key, `type/${typeSlug}`),
        ),
      )
      .limit(1);
    const raw = rows[0]?.payload;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { offensive?: OffensiveProfile };
    return parsed.offensive ?? null;
  } catch {
    return null;
  }
}

function typeMultiplier(
  offensive: OffensiveProfile | null,
  defenderType: string,
): number {
  if (!offensive) return 1;
  const t = defenderType.toLowerCase();
  if (offensive.no_effect_against.includes(t)) return 0;
  if (offensive.super_effective_against.includes(t)) return 2;
  if (offensive.not_very_effective_against.includes(t)) return 0.5;
  return 1;
}

function computeOne(
  format: Format,
  p: {
    base_stat: number;
    is_hp?: boolean;
    iv: number;
    ev: number;
    level: number;
    nature_effect: "boosted" | "neutral" | "hindered";
  },
): ComputeStatResult {
  if (format === "champions") return computeStatChampions(p);
  return computeStat(p);
}

function statValue(result: ComputeStatResult): number | null {
  return "value" in result ? result.value : null;
}

function natureFor(
  nature: string | null | undefined,
  stat: NatureStat,
): "boosted" | "neutral" | "hindered" {
  return natureEffectFor(nature, stat);
}

function sideLevel(side: CalcSide, format: Format): number {
  return side.level ?? defaultCalcLevel(format);
}

function percentOf(damage: number, hp: number): number {
  if (hp <= 0) return 0;
  return Math.round((damage / hp) * 1000) / 10;
}

function koHits(minDamage: number, hp: number): number {
  if (minDamage <= 0) return 0;
  return Math.max(1, Math.ceil(hp / minDamage));
}

function toSpreadEstimate(
  min_damage: number,
  max_damage: number,
  hp: number,
): CalcSpreadEstimate {
  return {
    min_damage,
    max_damage,
    percent_min: percentOf(min_damage, hp),
    percent_max: percentOf(max_damage, hp),
    ko: { hits: koHits(min_damage, hp) },
  };
}

type ResolvedMove = {
  slug: string;
  name: string;
  power: number;
  type: string;
  category: "physical" | "special";
};

function attackerTypes(profile: PokemonProfile, tera: string | null | undefined): string[] {
  if (!blank(tera)) return [tera!.trim().toLowerCase()];
  return profile.types.map((t) => t.toLowerCase());
}

function defenderTypes(profile: PokemonProfile, tera: string | null | undefined): string[] {
  if (!blank(tera)) return [tera!.trim().toLowerCase()];
  return profile.types.map((t) => t.toLowerCase());
}

function baseFor(profile: PokemonProfile, key: StatAbbrev): number {
  switch (key) {
    case "hp":
      return profile.base_stats.hp;
    case "atk":
      return profile.base_stats.attack;
    case "def":
      return profile.base_stats.defense;
    case "spa":
      return profile.base_stats.special_attack;
    case "spd":
      return profile.base_stats.special_defense;
    case "spe":
      return profile.base_stats.speed;
  }
}

function offensiveKey(category: "physical" | "special"): NatureStat {
  return category === "physical" ? "atk" : "spa";
}

function defensiveKey(category: "physical" | "special"): NatureStat {
  return category === "physical" ? "def" : "spd";
}

function finishEstimate(p: {
  level: number;
  power: number;
  attack: number;
  defense: number;
  hp: number;
  stab: boolean;
  type_effectiveness: number;
  atkItem?: string | null;
  atkAbility?: string | null;
  defAbility?: string | null;
  defItem?: string | null;
  fieldWeather?: string;
  fieldReflect: boolean;
  fieldLightScreen: boolean;
  category: "physical" | "special";
  moveType: string;
}):
  | {
      min_damage: number;
      max_damage: number;
      breakdown: string;
      hp: number;
      applied: CalcApplied;
    }
  | { ok: false; error: "incomplete"; detail: string } {
  const mods = resolveModifiers({
    item: p.atkItem,
    ability: p.atkAbility,
    weather: p.fieldWeather,
    reflect: p.fieldReflect,
    lightScreen: p.fieldLightScreen,
    category: p.category,
    typeEffectiveness: p.type_effectiveness,
    moveType: p.moveType,
  });

  const unsupported = [...mods.unsupported];
  if (!blank(p.defAbility)) {
    const name = p.defAbility!.trim();
    if (!unsupported.includes(name)) unsupported.push(name);
  }
  if (!blank(p.defItem)) {
    const leftover = resolveModifiers({ item: p.defItem });
    for (const name of leftover.unsupported) {
      if (!unsupported.includes(name)) unsupported.push(name);
    }
  }

  const est = estimateDamage({
    level: p.level,
    power: p.power,
    attack_stat: p.attack,
    defense_stat: p.defense,
    stab: p.stab,
    type_effectiveness: p.type_effectiveness,
    other_modifier: mods.other_modifier,
  });
  if ("error" in est) {
    return { ok: false, error: "incomplete", detail: est.detail };
  }

  const applied: CalcApplied = {
    stab: p.stab,
    type_effectiveness: p.type_effectiveness,
    other_modifier: mods.other_modifier,
    unsupported,
  };
  if (mods.applied.weather) applied.weather = mods.applied.weather;
  if (mods.applied.screens) applied.screens = mods.applied.screens;
  if (mods.applied.item) applied.item = mods.applied.item;

  return {
    min_damage: est.min_damage,
    max_damage: est.max_damage,
    breakdown: est.breakdown,
    hp: p.hp,
    applied,
  };
}

async function rollDamage(
  db: CalcDb,
  format: Format,
  attacker: PokemonProfile,
  defender: PokemonProfile,
  atkSide: CalcSide,
  defSide: CalcSide,
  move: ResolvedMove,
  field: CalcScenario["field"],
): Promise<
  | {
      min_damage: number;
      max_damage: number;
      breakdown: string;
      hp: number;
      applied: CalcApplied;
    }
  | { ok: false; error: "incomplete"; detail: string }
> {
  const level = sideLevel(atkSide, format);
  const defLevel = sideLevel(defSide, format);
  const atkKey = offensiveKey(move.category);
  const defKey = defensiveKey(move.category);

  const attack = statValue(
    computeOne(format, {
      base_stat: baseFor(attacker, atkKey),
      iv: readSpread(atkSide.ivs, atkKey, 31, 31),
      ev: readSpread(atkSide.evs, atkKey, 0, 252),
      level,
      nature_effect: natureFor(atkSide.nature, atkKey),
    }),
  );
  const defense = statValue(
    computeOne(format, {
      base_stat: baseFor(defender, defKey),
      iv: readSpread(defSide.ivs, defKey, 31, 31),
      ev: readSpread(defSide.evs, defKey, 0, 252),
      level: defLevel,
      nature_effect: natureFor(defSide.nature, defKey),
    }),
  );
  const hp = statValue(
    computeOne(format, {
      base_stat: baseFor(defender, "hp"),
      is_hp: true,
      iv: readSpread(defSide.ivs, "hp", 31, 31),
      ev: readSpread(defSide.evs, "hp", 0, 252),
      level: defLevel,
      nature_effect: "neutral",
    }),
  );
  if (attack == null || defense == null || hp == null) {
    return { ok: false, error: "incomplete", detail: "could not compute stats" };
  }

  const typesAtk = attackerTypes(attacker, atkSide.tera);
  const typesDef = defenderTypes(defender, defSide.tera);
  const stab = typesAtk.includes(move.type);
  const offensive = await loadOffensive(db, format, move.type);
  const type_effectiveness = typesDef.reduce(
    (acc, t) => acc * typeMultiplier(offensive, t),
    1,
  );

  return finishEstimate({
    level,
    power: move.power,
    attack,
    defense,
    hp,
    stab,
    type_effectiveness,
    atkItem: atkSide.item,
    atkAbility: atkSide.ability,
    defAbility: defSide.ability,
    defItem: defSide.item,
    fieldWeather: field?.weather,
    fieldReflect: field?.reflect === true,
    fieldLightScreen: field?.light_screen === true,
    category: move.category,
    moveType: move.type,
  });
}

function boostingNature(stat: NatureStat): string {
  return stat === "def" ? "bold" : "calm";
}

async function commonSpreads(
  db: CalcDb,
  format: Format,
  attacker: PokemonProfile,
  defender: PokemonProfile,
  atkSide: CalcSide,
  defSide: CalcSide,
  move: ResolvedMove,
  field: CalcScenario["field"],
): Promise<Array<{ label: "min" | "bulky" | "max"; estimate: CalcSpreadEstimate }>> {
  const defKey = defensiveKey(move.category);
  const rows: Array<{
    label: "min" | "bulky" | "max";
    evs: NonNullable<CalcSide["evs"]>;
    nature: string | null;
  }> = [
    { label: "min", evs: { hp: 0, [defKey]: 0 }, nature: null },
    { label: "bulky", evs: { hp: 252, [defKey]: 252 }, nature: null },
    {
      label: "max",
      evs: { hp: 252, [defKey]: 252 },
      nature: boostingNature(defKey),
    },
  ];

  const out: Array<{
    label: "min" | "bulky" | "max";
    estimate: CalcSpreadEstimate;
  }> = [];
  for (const row of rows) {
    const rolled = await rollDamage(
      db,
      format,
      attacker,
      defender,
      atkSide,
      { ...defSide, evs: row.evs, nature: row.nature },
      move,
      field,
    );
    if ("ok" in rolled && rolled.ok === false) continue;
    if ("min_damage" in rolled) {
      out.push({
        label: row.label,
        estimate: toSpreadEstimate(rolled.min_damage, rolled.max_damage, rolled.hp),
      });
    }
  }
  return out;
}

export async function runCalc(
  scenario: CalcScenario,
  dbArg?: CalcDb,
): Promise<CalcResult> {
  const atkName = scenario.attacker.species?.trim() ?? "";
  const defName = scenario.defender.species?.trim() ?? "";
  const moveSlugRaw = scenario.move.slug?.trim() || scenario.move.name?.trim() || "";

  if (!atkName || !defName || !moveSlugRaw) {
    return {
      ok: false,
      error: "incomplete",
      detail: "attacker, defender, and move identity are required",
    };
  }

  const db = resolveDb(dbArg);
  const format = scenario.format;

  if (!(await indexAvailable(db, format))) {
    return { ok: false, error: "index_unavailable" };
  }

  const [atkResult, defResult] = await Promise.all([
    getPokemon(atkName, format, db),
    getPokemon(defName, format, db),
  ]);

  if (atkResult.found === false || defResult.found === false) {
    const suggestions = [
      ...(atkResult.found === false ? atkResult.suggestions : []),
      ...(defResult.found === false ? defResult.suggestions : []),
    ];
    return {
      ok: false,
      error: "unresolved",
      detail: "species not in format",
      suggestions,
    };
  }

  const moveSlug = toSlug(moveSlugRaw);
  const moveResult = await loadMove(db, format, moveSlug);

  let resolved: ResolvedMove | null = null;
  if (moveResult.found === true) {
    const category = moveResult.damage_class;
    const power = moveResult.power;
    if (category === "status" || power == null || power <= 0) {
      return { ok: false, error: "status_move" };
    }
    if (category !== "physical" && category !== "special") {
      return { ok: false, error: "status_move" };
    }
    resolved = {
      slug: moveSlug,
      name: moveResult.display_name,
      power,
      type: (scenario.move.type ?? moveResult.type).toLowerCase(),
      category,
    };
  } else if (
    scenario.move.power != null &&
    Number.isFinite(scenario.move.power) &&
    scenario.move.power > 0 &&
    scenario.move.category !== "status"
  ) {
    const category = scenario.move.category;
    if (category !== "physical" && category !== "special") {
      return {
        ok: false,
        error: "unresolved",
        detail: "move not in format",
        suggestions: moveResult.suggestions,
      };
    }
    resolved = {
      slug: moveSlug,
      name: scenario.move.name?.trim() || moveSlug,
      power: scenario.move.power,
      type: (scenario.move.type ?? "normal").toLowerCase(),
      category,
    };
  } else if (scenario.move.category === "status") {
    return { ok: false, error: "status_move" };
  } else {
    return {
      ok: false,
      error: "unresolved",
      detail: "move not in format",
      suggestions: moveResult.suggestions,
    };
  }

  const rolled = await rollDamage(
    db,
    format,
    atkResult,
    defResult,
    scenario.attacker,
    scenario.defender,
    resolved,
    scenario.field,
  );
  if ("error" in rolled) return rolled;

  const estimate = {
    ...toSpreadEstimate(rolled.min_damage, rolled.max_damage, rolled.hp),
    is_estimate: true as const,
  };

  const result: Extract<CalcResult, { ok: true }> = {
    ok: true,
    format,
    estimate,
    breakdown: rolled.breakdown,
    applied: rolled.applied,
  };

  if (OLD_GEN_FORMATS.has(format)) {
    result.caveat = "modern_estimate";
  }

  if (scenario.defender.evs === undefined) {
    const spreads = await commonSpreads(
      db,
      format,
      atkResult,
      defResult,
      scenario.attacker,
      scenario.defender,
      resolved,
      scenario.field,
    );
    if (spreads.length === 3) result.common_spreads = spreads;
  }

  return result;
}
