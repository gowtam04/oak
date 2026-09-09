/**
 * Composer `/` picker model (slash-discovery). Catalog, phase, prefix
 * filter, insert strings, Dex-row merge, and bind-still-valid. Pure — no
 * I/O, no POST.
 */

import {
  parseSlashCommand,
  slashArg,
  type DexBind,
} from "./slash-commands";

export const SLASH_COMMANDS = [
  { token: "/new", hint: "New empty chat", trailingSpace: false, arg: "none" },
  {
    token: "/team",
    hint: "Open Teams",
    hintGuest: "Open Teams · sign in to save",
    trailingSpace: true,
    arg: "team",
  },
  { token: "/dex", hint: "Open Dex", trailingSpace: true, arg: "dex" },
  { token: "/usage", hint: "Open live usage", trailingSpace: true, arg: "usage" },
  { token: "/calc", hint: "Open calculator", trailingSpace: true, arg: "none" },
  { token: "/help", hint: "Show these commands", trailingSpace: false, arg: "none" },
] as const;

export type CommandRow = (typeof SLASH_COMMANDS)[number];

export type SlashPickerPhase =
  | { phase: "hidden" }
  | { phase: "commands"; prefix: string; rows: CommandRow[] }
  | { phase: "args"; command: "dex" | "team" | "usage"; query: string }
  | { phase: "rest"; command: "calc" | "new" | "help" };

export type DexNameRow = {
  kind: "pokemon" | "move" | "ability" | "item";
  slug: string;
  displayName: string;
  spriteUrl?: string;
};

export const PICKER_CAPTION = "Insert, then send";
export const EMPTY_DEX = "No Dex matches";
export const EMPTY_USAGE = "No usage matches";
export const EMPTY_TEAMS = "No saved teams match";
export const EMPTY_TEAMS_GUEST = "Sign in to save teams";

const KIND_ORDER: DexNameRow["kind"][] = ["pokemon", "move", "ability", "item"];

export function slashPickerPhase(text: string): SlashPickerPhase {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return { phase: "hidden" };

  const match = /^\S+/.exec(trimmed);
  const token = match ? match[0] : "";
  const hasSpaceAfter = /^\s/.test(trimmed.slice(token.length));

  if (!hasSpaceAfter) {
    const rows = filterCommands(token);
    if (rows.length === 0) return { phase: "hidden" };
    return { phase: "commands", prefix: token, rows };
  }

  const command = SLASH_COMMANDS.find(
    (row) => row.token === token.toLowerCase(),
  );
  if (!command) return { phase: "hidden" };

  if (command.arg === "dex" || command.arg === "team" || command.arg === "usage") {
    return { phase: "args", command: command.arg, query: slashArg(text) };
  }

  const rest = command.token.slice(1);
  if (rest === "calc" || rest === "new" || rest === "help") {
    return { phase: "rest", command: rest };
  }
  return { phase: "hidden" };
}

export function filterCommands(prefix: string): CommandRow[] {
  const needle = prefix.toLowerCase();
  return SLASH_COMMANDS.filter((row) =>
    row.token.toLowerCase().startsWith(needle),
  );
}

export function insertCommand(token: string): string {
  const row = SLASH_COMMANDS.find(
    (command) => command.token.toLowerCase() === token.toLowerCase(),
  );
  if (!row) return token;
  return row.trailingSpace ? `${row.token} ` : row.token;
}

export function insertName(commandToken: string, displayName: string): string {
  return `${commandToken} ${displayName}`;
}

export function mergeDexNameRows(
  byKind: { kind: DexNameRow["kind"]; matches: DexNameRow[] }[],
  limit = 8,
): DexNameRow[] {
  const buckets = new Map<DexNameRow["kind"], DexNameRow[]>();
  for (const kind of KIND_ORDER) buckets.set(kind, []);
  for (const group of byKind) {
    buckets.get(group.kind)?.push(...group.matches);
  }

  const seen = new Set<string>();
  const merged: DexNameRow[] = [];
  for (const kind of KIND_ORDER) {
    for (const row of buckets.get(kind) ?? []) {
      const key = `${row.kind}:${row.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

export function bindStillValid(bind: DexBind, composerText: string): boolean {
  const parsed = parseSlashCommand(composerText, { hasUsagePage: true });
  if (parsed.type !== "navigate" || parsed.target !== "dex") return false;
  return slashArg(composerText).toLowerCase() === bind.displayName.toLowerCase();
}
