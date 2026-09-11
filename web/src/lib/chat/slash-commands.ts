/**
 * Classify a composer send as a leading slash command or a normal message
 * (SLASH-US-1 / ADR-10). The parser only classifies — it does not POST.
 *
 * Known tokens (case-insensitive exact match): `/new`, `/team`, `/dex`,
 * `/calc`, `/help`, and `/usage` only when the client has a usage page.
 * After trim, text `=== "/"` is `bare`. `slashArg` is the remainder after
 * the first token, trimmed. `/calc` rest is that remainder. `/compare`
 * stays an ordinary message (CMP-BR-3). Unknown slashes are ordinary
 * messages.
 */

export type SlashNavigateTarget = "new" | "team" | "dex" | "usage";

export type DexBind = {
  kind: "pokemon" | "move" | "ability" | "item";
  slug: string;
  displayName: string;
};

export type SlashCommandResult =
  | { type: "navigate"; target: SlashNavigateTarget }
  | { type: "calc"; rest: string }
  | { type: "help" }
  | { type: "bare" }
  | { type: "message" };

export interface ParseSlashCommandOptions {
  /** When false, `/usage` classifies as a message. Production clients pass true. */
  hasUsagePage: boolean;
}

/**
 * Leading-token parse. First whitespace-delimited token after leading
 * whitespace wins. Exact token match only (`/newish` / `/calcish` are
 * messages), compared case-insensitively. `/calc` rest is the substring
 * after the token, trimmed.
 */
export function parseSlashCommand(
  text: string,
  { hasUsagePage }: ParseSlashCommandOptions,
): SlashCommandResult {
  if (text.trim() === "/") return { type: "bare" };

  const token = firstToken(text);
  const command = token.toLowerCase();
  if (command === "/new") return { type: "navigate", target: "new" };
  if (command === "/team") return { type: "navigate", target: "team" };
  if (command === "/dex") return { type: "navigate", target: "dex" };
  if (command === "/help") return { type: "help" };
  if (command === "/calc") {
    return { type: "calc", rest: slashArg(text) };
  }
  if (command === "/usage" && hasUsagePage) {
    return { type: "navigate", target: "usage" };
  }
  return { type: "message" };
}

/** Remainder after the first `\S+` token, trimmed. Empty string if none. */
export function slashArg(text: string): string {
  const trimmed = text.trimStart();
  const token = firstToken(trimmed);
  if (!token) return "";
  return trimmed.slice(token.length).trim();
}

function firstToken(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed) return "";
  const match = /^\S+/.exec(trimmed);
  return match ? match[0] : "";
}
