/**
 * Sequential `/calc` slash slots (SD-US-10). Pure picker state + insert
 * strings; resolve-on-send takes an injected search and never throws.
 */

import { CHAMPIONS_FORMAT } from "@/data/formats";
import type { CalcScenario } from "@/lib/calc/calc-schema";

import type { DexNameRow } from "./slash-picker";

export type CalcSlot = "attacker" | "move" | "defender";

export type CalcBind = {
  attacker?: DexNameRow;
  move?: DexNameRow;
  defender?: DexNameRow;
};

export type CalcPickerState = {
  slot: CalcSlot;
  query: string;
  bind: CalcBind;
  vsPresent: boolean;
};

export type CalcRestSplit = {
  left: string;
  right: string | null;
  vsPresent: boolean;
};

export const CALC_CAPTION_ATTACKER = "Pick attacker · or Send to open empty";
export const CALC_CAPTION_MOVE = "Pick move · or Send";
export const CALC_CAPTION_DEFENDER = "Pick defender · or Send";
export const CALC_SKIP_MOVE = "vs …";
export const CALC_SKIP_MOVE_HINT = "Skip move";
export const EMPTY_CALC_SPECIES = "No Pokémon matches";
export const EMPTY_CALC_MOVE = "No move matches";

const VS_RE = /\s+(?:vs\.?|versus)(?:\s+|$)/i;

export function emptyCalcScenario(): CalcScenario {
  return {
    format: CHAMPIONS_FORMAT,
    attacker: {},
    defender: {},
    move: {},
  };
}

export function splitCalcRest(rest: string): CalcRestSplit {
  const trimmed = rest.trim();
  if (!trimmed) return { left: "", right: null, vsPresent: false };
  const match = VS_RE.exec(trimmed);
  if (!match) return { left: trimmed, right: null, vsPresent: false };
  const left = trimmed.slice(0, match.index).trim();
  const right = trimmed.slice(match.index + match[0].length).trim();
  return { left, right, vsPresent: true };
}

export function insertCalcAttacker(displayName: string): string {
  return `/calc ${displayName} `;
}

export function insertCalcMove(attacker: string, move: string): string {
  return `/calc ${attacker} ${move} vs `;
}

export function insertCalcSkipMove(attacker: string): string {
  return `/calc ${attacker} vs `;
}

export function insertCalcDefender(
  attacker: string,
  move: string | undefined,
  defender: string,
): string {
  if (move) return `/calc ${attacker} ${move} vs ${defender}`;
  return `/calc ${attacker} vs ${defender}`;
}

export function calcPickerCaption(slot: CalcSlot): string {
  if (slot === "attacker") return CALC_CAPTION_ATTACKER;
  if (slot === "move") return CALC_CAPTION_MOVE;
  return CALC_CAPTION_DEFENDER;
}

export function showCalcSkipMove(slot: CalcSlot, query: string): boolean {
  return slot === "move" && query.trim() === "";
}

export function calcPickerState(
  rest: string,
  bind: CalcBind | null,
): CalcPickerState {
  const trimmed = rest.trim();
  const stripped = stripCalcBind(trimmed, bind);
  const split = splitCalcRest(trimmed);

  if (!stripped.attacker) {
    return {
      slot: "attacker",
      query: split.vsPresent ? split.left : trimmed,
      bind: {},
      vsPresent: split.vsPresent,
    };
  }

  if (!split.vsPresent) {
    return {
      slot: "move",
      query: remainderAfterName(stripped.attacker.displayName, split.left),
      bind: stripped,
      vsPresent: false,
    };
  }

  return {
    slot: "defender",
    query: split.right ?? "",
    bind: stripped,
    vsPresent: true,
  };
}

export function calcBindsEqual(a: CalcBind | null, b: CalcBind | null): boolean {
  return rowKey(a?.attacker) === rowKey(b?.attacker)
    && rowKey(a?.move) === rowKey(b?.move)
    && rowKey(a?.defender) === rowKey(b?.defender);
}

export type CalcSearchFn = (
  kind: "pokemon" | "move",
  query: string,
) => Promise<DexNameRow[]>;

export async function resolveCalcScenario(opts: {
  rest: string;
  bind: CalcBind | null;
  search: CalcSearchFn;
}): Promise<CalcScenario> {
  try {
    return await resolveCalcScenarioInner(opts);
  } catch {
    return emptyCalcScenario();
  }
}

async function resolveCalcScenarioInner(opts: {
  rest: string;
  bind: CalcBind | null;
  search: CalcSearchFn;
}): Promise<CalcScenario> {
  const trimmed = opts.rest.trim();
  if (!trimmed) return emptyCalcScenario();

  const state = calcPickerState(trimmed, opts.bind);
  const split = splitCalcRest(trimmed);
  let attacker = state.bind.attacker;
  let move = state.bind.move;
  let defender = state.bind.defender;

  if (!attacker) {
    const hit = await longestPrefixMatch(split.left, "pokemon", opts.search);
    if (hit) {
      attacker = hit.row;
      const leftover = split.left.slice(hit.consumed.length).trim();
      if (!move && leftover) {
        const moveHit = await longestPrefixMatch(leftover, "move", opts.search);
        if (moveHit) move = moveHit.row;
      }
    }
  } else if (!move) {
    const leftover = remainderAfterName(attacker.displayName, split.left);
    if (leftover) {
      const moveHit = await longestPrefixMatch(leftover, "move", opts.search);
      if (moveHit) move = moveHit.row;
    }
  }

  if (!defender && split.vsPresent && split.right) {
    const hit = await longestPrefixMatch(split.right, "pokemon", opts.search);
    if (hit) defender = hit.row;
  }

  return scenarioFromRows(attacker, move, defender);
}

export function scenarioFromCalcBind(bind: CalcBind | null): CalcScenario {
  return scenarioFromRows(bind?.attacker, bind?.move, bind?.defender);
}

function scenarioFromRows(
  attacker: DexNameRow | undefined,
  move: DexNameRow | undefined,
  defender: DexNameRow | undefined,
): CalcScenario {
  return {
    format: CHAMPIONS_FORMAT,
    attacker: attacker ? { species: attacker.slug } : {},
    defender: defender ? { species: defender.slug } : {},
    move: move ? { slug: move.slug, name: move.displayName } : {},
  };
}

function stripCalcBind(rest: string, bind: CalcBind | null): CalcBind {
  if (!bind?.attacker) return {};
  const trimmed = rest.trim();
  if (!namePrefixesRest(bind.attacker.displayName, trimmed)) return {};

  const split = splitCalcRest(trimmed);
  const afterAttacker = remainderAfterName(bind.attacker.displayName, split.left);

  let move = bind.move;
  if (move) {
    if (!afterAttacker || !namePrefixesRest(move.displayName, afterAttacker)) {
      move = undefined;
    }
  }

  let defender = bind.defender;
  if (
    !split.vsPresent
    || !split.right
    || !defender
    || !namePrefixesRest(defender.displayName, split.right)
  ) {
    defender = undefined;
  }

  const next: CalcBind = { attacker: bind.attacker };
  if (move) next.move = move;
  if (defender) next.defender = defender;
  return next;
}

function namePrefixesRest(name: string, rest: string): boolean {
  const n = name.trim();
  const r = rest.trimStart();
  if (!n || !r.toLowerCase().startsWith(n.toLowerCase())) return false;
  const after = r.slice(n.length);
  return after.length === 0 || /^\s/.test(after);
}

function remainderAfterName(name: string, rest: string): string {
  const r = rest.trimStart();
  if (!namePrefixesRest(name, r)) return r.trim();
  return r.slice(name.length).trimStart();
}

function exactRow(rows: DexNameRow[], query: string): DexNameRow | undefined {
  const needle = query.toLowerCase();
  return (
    rows.find((row) => row.displayName.toLowerCase() === needle)
    ?? rows.find((row) => row.slug.toLowerCase() === needle)
  );
}

async function longestPrefixMatch(
  text: string,
  kind: "pokemon" | "move",
  search: CalcSearchFn,
): Promise<{ row: DexNameRow; consumed: string } | null> {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  for (let n = tokens.length; n >= 1; n -= 1) {
    const candidate = tokens.slice(0, n).join(" ");
    let rows: DexNameRow[] = [];
    try {
      rows = await search(kind, candidate);
    } catch {
      rows = [];
    }
    const row = exactRow(rows, candidate);
    if (row) return { row, consumed: candidate };
  }
  return null;
}

function rowKey(row: DexNameRow | undefined): string {
  return row ? `${row.kind}:${row.slug}` : "";
}
