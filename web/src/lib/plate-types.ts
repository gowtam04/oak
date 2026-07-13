/**
 * Map Pokémon type names → CSS custom properties for specimen-plate washes
 * (`--plate-a` / `--plate-b`) and sprite type-glow. Tokens match globals.css
 * `--type-*` solids (soul.md plate wash rules).
 */

import type { CSSProperties } from "react";

const TYPE_TOKEN_LIST = [
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
] as const;

const TYPE_TOKENS = new Set<string>(TYPE_TOKEN_LIST);

/** Word-boundary matchers for conservative streaming type hints. */
const TYPE_WORD_RE = new RegExp(
  `\\b(${TYPE_TOKEN_LIST.join("|")})\\b`,
  "gi",
);

/** Resolve a type name to `var(--type-…)` (falls back to normal). */
export function typeCssVar(type: string | undefined | null): string {
  const t = (type ?? "").toLowerCase();
  return TYPE_TOKENS.has(t) ? `var(--type-${t})` : "var(--type-normal)";
}

/** True when the string is a known type slug (case-insensitive). */
export function isTypeName(type: string | undefined | null): boolean {
  return TYPE_TOKENS.has((type ?? "").toLowerCase());
}

export type PlateKind = "typed" | "multi" | "ink";

export interface PlateVars {
  kind: PlateKind;
  /** Inline style setting `--plate-a` / `--plate-b`. */
  style: CSSProperties;
  /**
   * Extra class for the plate shell
   * (`answer-card--ink` / `answer-card--multi` / empty for typed).
   * Also used on `.artifact-viewer` / skeleton via shared plate modifiers.
   */
  className: string;
}

function inkPlate(): PlateVars {
  return {
    kind: "ink",
    className: "answer-card--ink",
    style: {
      ["--plate-a" as string]: "var(--neutral-500)",
      ["--plate-b" as string]: "var(--neutral-600)",
    },
  };
}

function typedPlate(types: string[]): PlateVars {
  const a = typeCssVar(types[0]);
  const b = typeCssVar(types[1] ?? types[0]);
  return {
    kind: "typed",
    className: "",
    style: {
      ["--plate-a" as string]: a,
      ["--plate-b" as string]: b,
    },
  };
}

function multiPlate(types: string[]): PlateVars {
  const a = typeCssVar(types[0]);
  const b = typeCssVar(types[1] ?? types[0]);
  return {
    kind: "multi",
    className: "answer-card--multi",
    style: {
      ["--plate-a" as string]: a,
      ["--plate-b" as string]: b,
    },
  };
}

/**
 * Derive plate wash vars from a flat type list (artifact shells, roster slots).
 * - empty → ink plate
 * - 1–2 types → single dual-type wash
 * - 3+ types → multi accent (don't fight many washes)
 */
export function plateFromTypes(
  types: string[] | undefined | null,
): PlateVars {
  if (!types || types.length === 0) return inkPlate();
  const cleaned = types
    .map((t) => t.toLowerCase())
    .filter((t) => TYPE_TOKENS.has(t));
  if (cleaned.length === 0) return inkPlate();
  if (cleaned.length >= 3) return multiPlate(cleaned);
  return typedPlate(cleaned);
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
  if (!subjects || subjects.length === 0) return inkPlate();

  const first = subjects[0]!.types;
  if (subjects.length >= 2) return multiPlate(first);
  return typedPlate(first);
}

/**
 * Best-effort plate hint from streaming tool-activity labels (client-only).
 * Conservative: prefer no wash over a wrong type.
 * - Collect whole-word type mentions across labels
 * - Exactly 1 unique type → mild typed wash
 * - Exactly 2 unique types → dual-type wash (common dual-type phrasing)
 * - 0 or 3+ → null (caller uses sunken desk tint)
 */
export function plateHintFromToolLabels(
  labels: string[] | undefined | null,
): PlateVars | null {
  if (!labels || labels.length === 0) return null;
  const found = new Set<string>();
  for (const label of labels) {
    TYPE_WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TYPE_WORD_RE.exec(label)) !== null) {
      found.add(m[1]!.toLowerCase());
    }
  }
  if (found.size === 0 || found.size >= 3) return null;
  return plateFromTypes([...found]);
}
