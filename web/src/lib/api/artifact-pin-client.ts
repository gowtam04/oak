/**
 * artifact-pin-client — typed `fetch` helpers over
 * `/api/conversations/:id/artifact-pins` (PIN-US-1–3).
 *
 * Never throws: guest 401, foreign 404, or a transport fault fold into
 * a safe value (`[]` / `null`). Create surfaces `pin_cap` so the UI can
 * explain the 5-pin limit (PIN-AC-3.1) instead of treating it as a miss.
 */

export type ArtifactPinKind = "team_sheet" | "comparison" | "calc";

export interface PinnedArtifactSummary {
  id: string;
  kind: ArtifactPinKind;
  title: string;
  created_at: number;
}

export interface ArtifactPin {
  id: string;
  kind: ArtifactPinKind;
  title: string;
  snapshot: unknown;
}

export type CreatePinResult =
  | { ok: true; pin: ArtifactPin; pinnedArtifacts: PinnedArtifactSummary[] }
  | { ok: false; error: "pin_cap"; max: 5 }
  | { ok: false; error: string };

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

const PIN_KINDS = new Set<ArtifactPinKind>([
  "team_sheet",
  "comparison",
  "calc",
]);

function pinsUrl(conversationId: string, pinId?: string): string {
  const base = `/api/conversations/${encodeURIComponent(conversationId)}/artifact-pins`;
  return pinId === undefined ? base : `${base}/${encodeURIComponent(pinId)}`;
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    if (data !== null && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    /* non-JSON or empty body */
  }
  return {};
}

function asKind(value: unknown): ArtifactPinKind | null {
  return typeof value === "string" && PIN_KINDS.has(value as ArtifactPinKind)
    ? (value as ArtifactPinKind)
    : null;
}

function asSummary(value: unknown): PinnedArtifactSummary | null {
  if (value === null || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const kind = asKind(rec.kind);
  if (
    typeof rec.id !== "string" ||
    kind === null ||
    typeof rec.title !== "string" ||
    typeof rec.created_at !== "number"
  ) {
    return null;
  }
  return { id: rec.id, kind, title: rec.title, created_at: rec.created_at };
}

function asSummaries(value: unknown): PinnedArtifactSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asSummary)
    .filter((row): row is PinnedArtifactSummary => row !== null);
}

function asPin(value: unknown): ArtifactPin | null {
  if (value === null || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const kind = asKind(rec.kind);
  if (typeof rec.id !== "string" || kind === null || typeof rec.title !== "string") {
    return null;
  }
  return { id: rec.id, kind, title: rec.title, snapshot: rec.snapshot };
}

/** `GET /api/conversations/:id/artifact-pins` — this thread's strip, or `[]`. */
export async function listPinnedArtifacts(
  conversationId: string,
): Promise<PinnedArtifactSummary[]> {
  try {
    const res = await fetch(pinsUrl(conversationId), {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const body = await readJsonBody(res);
    return asSummaries(body.pinnedArtifacts);
  } catch {
    return [];
  }
}

/**
 * `POST /api/conversations/:id/artifact-pins` — snapshot a rich artifact.
 * 409 pin_cap is a first-class failure so the strip can explain the cap.
 */
export async function createPinnedArtifact(
  conversationId: string,
  input: { kind: ArtifactPinKind; title: string; snapshot: unknown },
): Promise<CreatePinResult> {
  try {
    const res = await fetch(pinsUrl(conversationId), {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const body = await readJsonBody(res);
    if (res.status === 409 && body.error === "pin_cap") {
      return { ok: false, error: "pin_cap", max: 5 };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : "request_failed",
      };
    }
    const pin = asPin(body.pin);
    if (pin === null) return { ok: false, error: "invalid_response" };
    return {
      ok: true,
      pin,
      pinnedArtifacts: asSummaries(body.pinnedArtifacts),
    };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** `GET …/artifact-pins/:pinId` — stored snapshot, or `null`. */
export async function getPinnedArtifact(
  conversationId: string,
  pinId: string,
): Promise<ArtifactPin | null> {
  try {
    const res = await fetch(pinsUrl(conversationId, pinId), {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return asPin(body.pin);
  } catch {
    return null;
  }
}

/**
 * `DELETE …/artifact-pins/:pinId` — unpin immediately. Returns the remaining
 * strip, or `null` on a miss / transport fault.
 */
export async function deletePinnedArtifact(
  conversationId: string,
  pinId: string,
): Promise<PinnedArtifactSummary[] | null> {
  try {
    const res = await fetch(pinsUrl(conversationId, pinId), {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return asSummaries(body.pinnedArtifacts);
  } catch {
    return null;
  }
}
