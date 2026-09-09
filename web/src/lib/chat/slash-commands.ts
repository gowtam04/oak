/**
 * Classify a composer send as a leading slash command or a normal message
 * (SLASH-US-1 / ADR-10). The parser only classifies — it does not POST.
 *
 * Known tokens: `/new`, `/team`, `/dex`, `/calc`, and `/usage` only when
 * the client has a usage page. `/calc` is a handled slash (ADR-4) — it
 * does not POST `/api/chat`. `/compare` stays an ordinary message
 * (CMP-BR-3). Unknown slashes are ordinary messages.
 */

export type SlashNavigateTarget = "new" | "team" | "dex" | "usage";

export type SlashCommandResult =
  | { type: "navigate"; target: SlashNavigateTarget }
  | { type: "calc"; rest: string }
  | { type: "message" };

export interface ParseSlashCommandOptions {
  /** Web has `/meta`; native does not until a usage surface ships. */
  hasUsagePage: boolean;
}

/**
 * Leading-token parse. First whitespace-delimited token after leading
 * whitespace wins. Exact token match only (`/newish` / `/calcish` are
 * messages). `/calc` rest is the substring after the token, trimmed.
 */
export function parseSlashCommand(
  text: string,
  { hasUsagePage }: ParseSlashCommandOptions,
): SlashCommandResult {
  const token = firstToken(text);
  if (token === "/new") return { type: "navigate", target: "new" };
  if (token === "/team") return { type: "navigate", target: "team" };
  if (token === "/dex") return { type: "navigate", target: "dex" };
  if (token === "/calc") {
    const trimmed = text.trimStart();
    return { type: "calc", rest: trimmed.slice(token.length).trim() };
  }
  if (token === "/usage" && hasUsagePage) {
    return { type: "navigate", target: "usage" };
  }
  return { type: "message" };
}

function firstToken(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed) return "";
  const match = /^\S+/.exec(trimmed);
  return match ? match[0] : "";
}
