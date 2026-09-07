/**
 * search-client — the typed `fetch` helper over `GET /api/search`.
 *
 * The team builder's EntityPicker calls this to turn a partial name into ranked
 * candidates (slug + display name) for one entity kind in one format. Mirrors
 * entity-client.ts / sprites-client.ts: it NEVER throws — a transport fault, a
 * non-2xx, or a malformed body all fold to `[]`, so the picker simply shows no
 * suggestions rather than erroring (the field stays a usable free-text input).
 */

import type { EntityKind } from "@/lib/entity-artifact";
import type { Format } from "@/data/formats";

export type { EntityKind };

/** One typeahead candidate — what the picker stores (slug) and shows (name). */
export interface SearchMatch {
  slug: string;
  display_name: string;
  kind: EntityKind;
  /** Present on pokemon matches that resolved to a `pokemon` row. */
  sprite_url?: string;
}

/** Best-effort narrowing of one match from the JSON body; null if malformed. */
function toMatch(value: unknown): SearchMatch | null {
  if (value === null || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (
    typeof m.slug !== "string" ||
    typeof m.display_name !== "string" ||
    typeof m.kind !== "string"
  ) {
    return null;
  }
  const match: SearchMatch = {
    slug: m.slug,
    display_name: m.display_name,
    kind: m.kind as EntityKind,
  };
  if (typeof m.sprite_url === "string" && m.sprite_url.length > 0) {
    match.sprite_url = m.sprite_url;
  }
  return match;
}

/**
 * Resolve candidate matches for a query `q` of one `kind` in `format`. A typed
 * `q` returns ranked matches (capped); a blank `q` returns the full kind
 * alphabetically (Dex browse / focused picker). A guest or any failure yields `[]`.
 */
export async function searchEntities(
  kind: EntityKind,
  q: string,
  format: Format,
): Promise<SearchMatch[]> {
  // An empty query is allowed: the route returns the full kind alphabetically
  // so Dex / a focused picker can browse before any typing.
  const query = q.trim();
  try {
    const params = new URLSearchParams({ kind, q: query, format });
    const res = await fetch(`/api/search?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const matches =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>).matches
        : null;
    if (!Array.isArray(matches)) return [];
    return matches
      .map(toMatch)
      .filter((m): m is SearchMatch => m !== null);
  } catch {
    return [];
  }
}
