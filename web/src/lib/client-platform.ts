/**
 * Client platform identity for admin analytics.
 *
 * Each Oak client (web / iOS / Android) sends `X-Oak-Client` on chat requests.
 * The allowlist is strict: missing or unknown values become `null` so the admin
 * panel never invents a platform for scripts, eval, or legacy traffic.
 *
 * Pure module — safe for client and server imports.
 */

/** Wire + storage values for the three first-party Oak clients. */
export type ClientPlatform = "web" | "ios" | "android";

/** Canonical order for multi-platform display (Web, iOS, Android). */
export const CLIENT_PLATFORMS: readonly ClientPlatform[] = [
  "web",
  "ios",
  "android",
] as const;

/** HTTP header name each client sends (lowercase comparison on read). */
export const CLIENT_PLATFORM_HEADER = "x-oak-client";

const ALLOWED = new Set<string>(CLIENT_PLATFORMS);

/**
 * Parse an `X-Oak-Client` header value into a {@link ClientPlatform}.
 * Trims + lowercases; returns `null` for missing/empty/unknown values.
 */
export function parseClientPlatform(
  header: string | null | undefined,
): ClientPlatform | null {
  if (header == null) return null;
  const v = header.trim().toLowerCase();
  if (v.length === 0) return null;
  return ALLOWED.has(v) ? (v as ClientPlatform) : null;
}

/** Human label for admin UI. */
export function clientPlatformLabel(client: ClientPlatform): string {
  switch (client) {
    case "web":
      return "Web";
    case "ios":
      return "iOS";
    case "android":
      return "Android";
  }
}

/**
 * Format a (possibly empty/mixed) set of platforms for the admin conversation
 * summary. Distinct values in {@link CLIENT_PLATFORMS} order; empty → "—".
 */
export function formatClientPlatforms(
  clients: readonly ClientPlatform[],
): string {
  const set = new Set(clients);
  const ordered = CLIENT_PLATFORMS.filter((c) => set.has(c));
  if (ordered.length === 0) return "—";
  return ordered.map(clientPlatformLabel).join(", ");
}
