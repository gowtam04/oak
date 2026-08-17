/**
 * `PATCH /api/account/preferences` — write the signed-in compact/full
 * preference (COMPACT-US-2, ADR-9).
 *
 *   { answer_density: "full" | "compact" } → 200 { answerDensity }
 *
 * Guest → 401 (AUTH-BR-1, COMPACT-BR-4). Account-scoped write via
 * `accounts-repo.updateAnswerDensity` (AUTH-BR-2).
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request): Promise<Response> {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (account === null) {
    return json(401, { error: "unauthenticated" });
  }

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const density = body.answer_density;
  if (density !== "full" && density !== "compact") {
    return jsonError(
      400,
      "invalid_request",
      'answer_density must be "full" or "compact".',
    );
  }

  const { updateAnswerDensity } = await import("@/data/repos/accounts-repo");
  await updateAnswerDensity(account.id, density);
  return json(200, { answerDensity: density });
}
