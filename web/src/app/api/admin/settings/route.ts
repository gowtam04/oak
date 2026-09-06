/**
 * `/api/admin/settings` — the operator-controlled active-model switch.
 *
 *   GET  → AdminSettingsResponse { activeModel, source, updatedBy, updatedAt,
 *          models, spend } — the resolved `app_setting` selection (or the
 *          `DEFAULT_MODEL_KEY` fallback, `source: "default"`) plus every
 *          registry model flagged `configured` (its provider API key present
 *          on this server), so the UI can render unconfigured models disabled,
 *          plus the spend-controls projection (`getCaps` + `getDenylist`).
 *   POST → body { model } sets the active-model selection (upsert), and
 *          returns the freshly re-read AdminSettingsResponse. `model` must be
 *          a known `ModelKey` (else 400 `invalid_request`) whose provider is
 *          configured (else 409 `model_not_configured`) — an operator can
 *          never select a model this server can't actually run.
 *
 * This is the SECOND admin WRITE (after champions-items' toggle). Gating
 * (ADMIN-AC-1.4): `requireAdminRequest` runs FIRST on BOTH verbs — 401 (no
 * session) / 403 (non-admin) / pass. The guard + repo + factory/registry are
 * reached via DYNAMIC import inside the handler so `next build`'s page-data
 * collection never eagerly evaluates the env/db-touching chain (CLAUDE.md
 * "API ROUTES").
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type {
  AdminSettingsModel,
  AdminSettingsResponse,
  AdminSpendState,
} from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadSpend(): Promise<AdminSpendState> {
  const { getCaps, getDenylist } = await import("@/data/repos/spend-repo");
  const [caps, denylist] = await Promise.all([getCaps(), getDenylist()]);
  return {
    signedCap: caps.signedCap,
    guestCap: caps.guestCap,
    denylist,
  };
}

async function buildSettingsResponse(): Promise<AdminSettingsResponse> {
  const { resolveActiveModel } = await import("@/data/repos/settings-repo");
  const { MODELS } = await import("@/agent/models");
  const { isModelConfigured } = await import("@/agent/providers/factory");

  const [active, spend] = await Promise.all([
    resolveActiveModel(),
    loadSpend(),
  ]);
  const models: AdminSettingsModel[] = MODELS.map((m) => ({
    key: m.key,
    label: m.label,
    provider: m.provider,
    configured: isModelConfigured(m.key),
  }));

  return {
    activeModel: active.key,
    source: active.source,
    updatedBy: active.updatedBy,
    updatedAt: active.updatedAt,
    models,
    spend,
  };
}

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("../_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const body = await buildSettingsResponse();
  return json(200, body);
}

export async function POST(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("../_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const raw = await readJsonObject(req);
  const model = raw?.model;

  const { isModelKey, MODELS } = await import("@/agent/models");
  if (typeof model !== "string" || !isModelKey(model)) {
    const validKeys = MODELS.map((m) => m.key).join(", ");
    return jsonError(
      400,
      "invalid_request",
      `Body must be { model } with one of: ${validKeys}.`,
    );
  }

  const { isModelConfigured } = await import("@/agent/providers/factory");
  if (!isModelConfigured(model)) {
    const { modelLabel } = await import("@/agent/models");
    return jsonError(
      409,
      "model_not_configured",
      `${modelLabel(model)}'s provider has no API key on this server.`,
    );
  }

  const { setActiveModelKey } = await import("@/data/repos/settings-repo");
  await setActiveModelKey(model, guard.account.email);

  const body = await buildSettingsResponse();
  return json(200, body);
}
