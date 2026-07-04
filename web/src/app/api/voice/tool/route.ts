/**
 * POST /api/voice/tool — relay ONE realtime function call from the browser voice
 * socket to Oak's tool layer and return its structured result (voice-mode plan
 * §5). The grok-voice model drives the call; the browser echoes the JSON result
 * back to the socket as a `function_call_output`.
 *
 * Signed-in only (401 gate). Defense in depth: the socket is a client-driven
 * channel, so the `name` MUST be one of the voice-advertised tools (Oak's tool
 * layer minus `VOICE_EXCLUDED_TOOLS`, `@/agent/tools/voice-gating`) — never let
 * it push `submit_answer`, a network/warehouse tool, or an arbitrary name into
 * `dispatch`. Malformed `arguments` return an IN-DOMAIN error (200) so the
 * voice model hears the miss and can recover, rather than a transport fault.
 * `dispatch` never throws in-domain; a genuine thrown fault (e.g. a DB outage)
 * is a clean 502.
 *
 * Env gotcha (same as /api/chat): the tool layer, agent context, and auth are
 * DYNAMIC-imported inside the handler so `next build` never evaluates `@/env`.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

import { readJsonBodyWithLimit } from "@/server/body-limit";
import { checkRateLimit, type RateLimitConfig } from "@/server/rate-limit";
import { FORMATS, modeForFormat, type Format } from "@/data/formats";
import { logger } from "@/server/logger";
import { VOICE_EXCLUDED_TOOLS } from "@/agent/tools/voice-gating";
import type { VoiceToolResponseBody } from "@/lib/voice/voice-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A tool call's args are small structured JSON; cap conservatively. */
const MAX_REQUEST_BYTES = 64 * 1024;

/**
 * Generous per-account cap — a single spoken turn can fan out into several
 * parallel tool calls, so 60/min leaves room for a natural conversation while
 * still bounding a runaway socket.
 */
const VOICE_TOOL_RATE_LIMIT: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 60,
  windowMs: 60_000,
};

const requestBodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    format: z.enum(FORMATS as unknown as [Format, ...Format[]]),
    name: z.string().min(1).max(100),
    arguments: z.string(),
  })
  .strict();

function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(body: VoiceToolResponseBody): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();

  // 0) Body under a hard streaming byte cap.
  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "request_too_large", "Request body is too large.");
    }
    return jsonError(400, "invalid_request", "Body must be valid JSON.");
  }
  const parsed = requestBodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError(
      400,
      "invalid_request",
      "Body must be { session_id, format, name, arguments }.",
    );
  }
  const { session_id, format, name, arguments: argsJson } = parsed.data;

  // 1) AUTH — signed-in only.
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    return jsonError(401, "sign_in_required", "Sign in to use voice mode.");
  }

  // 2) RATE LIMIT — one signed-in tier, keyed by account.
  const gate = await checkRateLimit(`acct:${account.id}`, "", VOICE_TOOL_RATE_LIMIT);
  if (!gate.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many tool calls — please wait a moment.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil(
              (gate.reason === "rate_limited" ? gate.retryAfterMs : 0) / 1000,
            ),
          ),
        },
      },
    );
  }

  // 3) TOOL ALLOWLIST — the socket is client-driven, so the name must be one of
  //    the voice-advertised tools (Oak's tool layer minus VOICE_EXCLUDED_TOOLS).
  //    This is the SAME filter `voiceToolDefs()` applies; building it straight
  //    from `@/agent/tools` keeps the route independent of the voice-prompt
  //    module.
  const { tools, dispatch } = await import("@/agent/tools");
  const allowedNames = new Set(
    tools.filter((t) => !VOICE_EXCLUDED_TOOLS.has(t.name)).map((t) => t.name),
  );
  if (!allowedNames.has(name)) {
    return jsonError(
      400,
      "unknown_tool",
      `Tool "${name}" is not available in voice mode.`,
    );
  }

  // 4) PARSE ARGS — a malformed args string is an IN-DOMAIN miss (200), not a
  //    transport fault: the voice model should hear the error and recover.
  let args: unknown;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return jsonOk({
      output: { error: "invalid_input", detail: "malformed arguments JSON" },
    });
  }

  // 5) DISPATCH — build a server-controlled context (scope from body.format,
  //    account for the team tools) and run the tool. dispatch never throws
  //    in-domain; a genuine thrown fault is a clean 502.
  try {
    const { createAgentContext } = await import("@/agent/context");
    const ctx = await createAgentContext({
      requestId,
      sessionId: session_id,
      mode: modeForFormat(format),
      accountId: account.id,
      signal: req.signal,
    });
    const output = await dispatch(name, args, ctx);
    return jsonOk({ output });
  } catch (err) {
    logger.error(
      {
        event: "voice_tool_dispatch_error",
        request_id: requestId,
        account_id: account.id,
        session_id,
        tool: name,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_tool_dispatch_error",
    );
    return jsonError(
      502,
      "tool_dispatch_error",
      "The tool hit an unexpected error. Please try again.",
    );
  }
}
