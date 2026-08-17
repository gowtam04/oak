/**
 * `/api/conversations/:id/artifact-pins` — list + create conversation
 * artifact pins (docs/features/answer-cards-and-artifacts PIN-US-1–3).
 *
 *   GET  → 200 { pinnedArtifacts }
 *   POST → 201 { pin, pinnedArtifacts }   body { kind, title, snapshot }
 *
 * Signed-in conversation owner only. Guest → 401. Foreign / missing
 * conversation → 404 (AUTH-BR-2 / AUTH-BR-3). 6th pin → 409
 * `{ error: "pin_cap", max: 5 }` (PIN-AC-3.1). Snapshots stored as given
 * (PIN-BR-1).
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type { ArtifactPin } from "@/data/repos/artifact-pin-repo";
import {
  artifactPinRepo,
  conversationRepo,
  currentAccount,
  errorCode,
} from "../../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PIN_CAP = 5;
const MAX_TITLE_LEN = 80;
const PIN_KINDS = new Set(["team_sheet", "comparison", "calc"]);

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });
const NOT_FOUND = () =>
  jsonError(404, "not_found", "Conversation not found.");

function toPinSummary(pin: ArtifactPin) {
  return {
    id: pin.id,
    kind: pin.kind,
    title: pin.title,
    created_at: pin.createdAt,
  };
}

function isPinKind(value: unknown): value is "team_sheet" | "comparison" | "calc" {
  return typeof value === "string" && PIN_KINDS.has(value);
}

/** kind + v=1 only — the rest of the snapshot is stored as given (PIN-BR-1). */
function snapshotMatchesKind(
  kind: string,
  snapshot: unknown,
): snapshot is Record<string, unknown> {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const rec = snapshot as Record<string, unknown>;
  return rec.v === 1 && rec.kind === kind;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const convs = await conversationRepo();
  if ((await convs.getConversation(account.id, id)) === null) return NOT_FOUND();

  const pins = await artifactPinRepo();
  const listed = await pins.list(account.id, id);
  return json(200, { pinnedArtifacts: listed.map(toPinSummary) });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const body = await readJsonObject(req, 256 * 1024);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  if (!isPinKind(body.kind)) {
    return jsonError(
      400,
      "invalid_request",
      "kind must be team_sheet, comparison, or calc.",
    );
  }
  if (typeof body.title !== "string") {
    return jsonError(400, "invalid_request", "title must be a string.");
  }
  const title = body.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LEN) {
    return jsonError(
      400,
      "invalid_title",
      `title must be 1–${MAX_TITLE_LEN} characters.`,
    );
  }
  if (!snapshotMatchesKind(body.kind, body.snapshot)) {
    return jsonError(
      400,
      "invalid_request",
      "snapshot must be { v: 1, kind } matching the pin kind.",
    );
  }

  const convs = await conversationRepo();
  if ((await convs.getConversation(account.id, id)) === null) return NOT_FOUND();

  const pins = await artifactPinRepo();
  let created: { id: string };
  try {
    created = await pins.insert({
      accountId: account.id,
      conversationId: id,
      kind: body.kind,
      title,
      snapshot: body.snapshot,
    });
  } catch (err) {
    if (errorCode(err) === "pin_cap") {
      return json(409, { error: "pin_cap", max: PIN_CAP });
    }
    throw err;
  }

  const pin = await pins.get(account.id, id, created.id);
  const listed = await pins.list(account.id, id);
  return json(201, {
    pin: pin
      ? {
          id: pin.id,
          kind: pin.kind,
          title: pin.title,
          snapshot: pin.snapshot,
          created_at: pin.createdAt,
        }
      : {
          id: created.id,
          kind: body.kind,
          title,
          snapshot: body.snapshot,
        },
    pinnedArtifacts: listed.map(toPinSummary),
  });
}
