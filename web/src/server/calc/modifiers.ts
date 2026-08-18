/**
 * Documented modifier catalog for the standalone calculator (ADR-3, CALC-BR-3).
 *
 * Supported knobs change `other_modifier` by a real multiplier — never 1.0
 * pretending they applied. Named leftovers (ability / item not in the catalog)
 * go in `unsupported[]` and do not fold into the multiplier.
 *
 * This is an honest subset, not Smogon-calc parity. Sun/rain change
 * `other_modifier` for Fire/Water. Sand and snow are catalog weather (recorded
 * on `applied.weather`) but do **not** change `other_modifier` — they are
 * defensive stat boosts applied in the engine (Rock +50% SpD / Ice +50% Def).
 */

export type CalcCategory = "physical" | "special" | "status";

export interface ResolveModifiersInput {
  item?: string | null;
  ability?: string | null;
  weather?: string | null;
  reflect?: boolean;
  lightScreen?: boolean;
  category?: CalcCategory;
  typeEffectiveness?: number;
  moveType?: string | null;
}

export interface ResolveModifiersApplied {
  weather?: string;
  screens?: string[];
  item?: string;
}

export interface ResolveModifiersResult {
  other_modifier: number;
  applied: ResolveModifiersApplied;
  unsupported: string[];
}

const LIFE_ORB = 1.3;
const CHOICE_ITEM = 1.5;
const EXPERT_BELT = 1.2;
const WEATHER_BOOST = 1.5;
const WEATHER_CUT = 0.5;
const SCREEN = 0.5;

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[_ ]+/g, "-");
}

function catalogItem(
  item: string,
): "life-orb" | "choice-band" | "choice-specs" | "expert-belt" | null {
  const slug = slugify(item);
  if (slug === "life-orb") return "life-orb";
  if (slug === "choice-band") return "choice-band";
  if (slug === "choice-specs") return "choice-specs";
  if (slug === "expert-belt") return "expert-belt";
  return null;
}

function displayItem(
  id: NonNullable<ReturnType<typeof catalogItem>>,
): string {
  switch (id) {
    case "life-orb":
      return "Life Orb";
    case "choice-band":
      return "Choice Band";
    case "choice-specs":
      return "Choice Specs";
    case "expert-belt":
      return "Expert Belt";
  }
}

function moveTypeSlug(moveType: string | null | undefined): string {
  return (moveType ?? "").trim().toLowerCase();
}

/**
 * Resolve catalog weather / screens / listed items into a combined multiplier
 * plus the applied/unsupported bookkeeping the engine echoes on the result.
 */
export function resolveModifiers(
  input: ResolveModifiersInput,
): ResolveModifiersResult {
  let other = 1;
  const applied: ResolveModifiersApplied = {};
  const unsupported: string[] = [];
  const screens: string[] = [];
  const moveType = moveTypeSlug(input.moveType);
  const category = input.category;

  const weather = input.weather?.trim().toLowerCase();
  if (weather && weather !== "none") {
    if (weather === "sun") {
      if (moveType === "fire") other *= WEATHER_BOOST;
      else if (moveType === "water") other *= WEATHER_CUT;
      applied.weather = "sun";
    } else if (weather === "rain") {
      if (moveType === "water") other *= WEATHER_BOOST;
      else if (moveType === "fire") other *= WEATHER_CUT;
      applied.weather = "rain";
    } else if (weather === "sand") {
      // Rock-type defenders get +50% SpD — applied on the stat in the engine.
      applied.weather = "sand";
    } else if (weather === "snow") {
      // Ice-type defenders get +50% Def — applied on the stat in the engine.
      applied.weather = "snow";
    } else {
      unsupported.push(input.weather!);
    }
  }

  if (input.reflect && category === "physical") {
    other *= SCREEN;
    screens.push("Reflect");
  }
  if (input.lightScreen && category === "special") {
    other *= SCREEN;
    screens.push("Light Screen");
  }
  if (screens.length > 0) applied.screens = screens;

  const rawItem = input.item?.trim();
  if (rawItem) {
    const id = catalogItem(rawItem);
    if (id === "life-orb") {
      other *= LIFE_ORB;
      applied.item = displayItem(id);
    } else if (id === "choice-band") {
      if (category === "physical") {
        other *= CHOICE_ITEM;
        applied.item = displayItem(id);
      }
    } else if (id === "choice-specs") {
      if (category === "special") {
        other *= CHOICE_ITEM;
        applied.item = displayItem(id);
      }
    } else if (id === "expert-belt") {
      if ((input.typeEffectiveness ?? 1) > 1) {
        other *= EXPERT_BELT;
        applied.item = displayItem(id);
      }
    } else {
      unsupported.push(rawItem);
    }
  }

  const rawAbility = input.ability?.trim();
  if (rawAbility) {
    unsupported.push(rawAbility);
  }

  return { other_modifier: other, applied, unsupported };
}
