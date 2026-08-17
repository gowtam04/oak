/**
 * Classify a composer send as a leading slash command or a normal message
 * (SLASH-US-1 / ADR-10). The parser only classifies — it does not POST.
 *
 * Known tokens: `/new`, `/team`, `/dex`, and `/usage` only when the client
 * has a usage page. Unknown slashes (including `/calc` / `/compare`) are
 * ordinary messages.
 */

export type SlashNavigateTarget = "new" | "team" | "dex" | "usage";

export type SlashCommandResult =
  | { type: "navigate"; target: SlashNavigateTarget }
  | { type: "message" };

export interface ParseSlashCommandOptions {
  /** Web has `/meta`; native does not until a usage surface ships. */
  hasUsagePage: boolean;
}

/**
 * Leading-token parse. First whitespace-delimited token after leading
 * whitespace wins. Exact token match only (`/newish` is a message).
 */
export function parseSlashCommand(
  text: string,
  { hasUsagePage }: ParseSlashCommandOptions,
): SlashCommandResult {
  const token = firstToken(text);
  if (token === "/new") return { type: "navigate", target: "new" };
  if (token === "/team") return { type: "navigate", target: "team" };
  if (token === "/dex") return { type: "navigate", target: "dex" };
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
