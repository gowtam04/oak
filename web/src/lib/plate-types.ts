/**
 * Map Pokémon type names → CSS custom properties for specimen-plate washes
 * (`--plate-a` / `--plate-b`) and sprite type-glow. Tokens match globals.css
 * `--type-*` solids (soul.md plate wash rules).
 */

import type { CSSProperties } from "react";

const TYPE_TOKENS = new Set([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);

/** Resolve a type name to `var(--type-…)` (falls back to normal). */
export function typeCssVar(type: string | undefined | null): string {
  const t = (type ?? "").toLowerCase();
  return TYPE_TOKENS.has(t) ? `var(--type-${t})` : "var(--type-normal)";
}

export type PlateKind = "typed" | "multi" | "ink";

export interface PlateVars {
  kind: PlateKind;
  /** Inline style setting `--plate-a` / `--plate-b`. */
  style: CSSProperties;
  /** Extra class on `.answer-card` (`answer-card--ink` / `answer-card--multi`). */
  className: string;
}

/**
 * Derive plate wash vars from `subjects[]`.
 * - 0 subjects → ink plate (mechanics)
 * - 1 subject → primary/secondary type wash
 * - 2+ subjects → multi (neutral-ish + light accent from first subject)
 */
export function plateFromSubjects(
  subjects: { types: string[] }[] | undefined | null,
): PlateVars {
  if (!subjects || subjects.length === 0) {
    return {
      kind: "ink",
      className: "answer-card--ink",
      style: {
        ["--plate-a" as string]: "var(--neutral-500)",
        ["--plate-b" as string]: "var(--neutral-600)",
      },
    };
  }

  const first = subjects[0]!.types;
  const a = typeCssVar(first[0]);
  const b = typeCssVar(first[1] ?? first[0]);

  if (subjects.length >= 2) {
    return {
      kind: "multi",
      className: "answer-card--multi",
      style: {
        ["--plate-a" as string]: a,
        ["--plate-b" as string]: b,
      },
    };
  }

  return {
    kind: "typed",
    className: "",
    style: {
      ["--plate-a" as string]: a,
      ["--plate-b" as string]: b,
    },
  };
}
