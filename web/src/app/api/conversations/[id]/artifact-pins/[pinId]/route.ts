/**
 * `/api/conversations/:id/artifact-pins/:pinId` — snapshot + unpin
 * (docs/features/answer-cards-and-artifacts PIN-US-2/3).
 *
 *   GET    → 200 { pin: { id, kind, title, snapshot } }
 *   DELETE → 200 { pinnedArtifacts }
 *
 * Signed-in conversation owner only. Guest → 401. Foreign conversation
 * or missing pin → 404 (AUTH-BR-2 / AUTH-BR-3, PIN-AC-3.4). Unpin is
 * immediate (PIN-AC-3.2).
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";
import type { ArtifactPin } from "@/data/repos/artifact-pin-repo";
import {
  artifactPinRepo,
  conversationRepo,
  currentAccount,
} from "../../../_lib/route-helpers";

function toPinSummary(pin: ArtifactPin) {
  return {
    id: pin.id,
    kind: pin.kind,
    title: pin.title,
    created_at: pin.createdAt,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pinId: string }> };

const UNAUTHORIZED = () => json(401, { error: "unauthenticated" });
const NOT_FOUND = () => jsonError(404, "not_found", "Conversation not found.");
const PIN_NOT_FOUND = () => jsonError(404, "not_found", "Pin not found.");

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id, pinId } = await ctx.params;

  const convs = await conversationRepo();
  if ((await convs.getConversation(account.id, id)) === null) return NOT_FOUND();

  const pins = await artifactPinRepo();
  const pin = await pins.get(account.id, id, pinId);
  if (pin === null) return PIN_NOT_FOUND();

  return json(200, {
    pin: {
      id: pin.id,
      kind: pin.kind,
      title: pin.title,
      snapshot: pin.snapshot,
    },
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id, pinId } = await ctx.params;

  const convs = await conversationRepo();
  if ((await convs.getConversation(account.id, id)) === null) return NOT_FOUND();

  const pins = await artifactPinRepo();
  const existing = await pins.get(account.id, id, pinId);
  if (existing === null) return PIN_NOT_FOUND();

  await pins.delete(account.id, id, pinId);
  const listed = await pins.list(account.id, id);
  return json(200, { pinnedArtifacts: listed.map(toPinSummary) });
}
