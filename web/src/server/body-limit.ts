/**
 * Streaming JSON body reader with a HARD byte cap (DoS guard EDGE-01).
 *
 * The chat / teams-assistant / auth / import routes previously guarded their
 * body size by reading the `Content-Length` header and rejecting when it
 * exceeded the cap, THEN calling `req.json()` (which buffers the whole body into
 * memory with no limit of its own). That check is trivially bypassable: a
 * request sent with `Transfer-Encoding: chunked` carries NO `Content-Length`
 * header, so `Number(req.headers.get("content-length"))` is `NaN`, the
 * `Number.isFinite(...)` guard is skipped, and `req.json()` then buffers an
 * attacker-controlled, arbitrarily large body — an easy memory-exhaustion DoS.
 *
 * This helper closes that hole by never trusting the declared length alone: it
 * keeps the cheap `Content-Length` pre-check as a FAST reject, then streams the
 * body through its `ReadableStream` reader while counting the ACTUAL decoded
 * bytes, and cancels the reader the instant the running total exceeds the cap —
 * so a chunked (or simply mis-declared) body can never be buffered past the
 * limit.
 *
 * Returns a discriminated Result (repo convention: never throw in-domain — the
 * caller maps each reason to its own HTTP status):
 *   - `{ ok: true,  value }`                      — parsed JSON (any JSON value)
 *   - `{ ok: false, reason: "too_large" }`        — over the byte cap (→ 413)
 *   - `{ ok: false, reason: "invalid_json" }`     — empty/absent/malformed body
 *                                                    or a transport read error
 */

export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

export async function readJsonBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<ReadJsonBodyResult> {
  // 1. Fast reject: a declared Content-Length already over the cap never gets
  //    read. An absent/chunked length is `NaN` here and simply falls through to
  //    the streaming counter below — that is the bypass this helper closes.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  // 2. An absent body (e.g. a GET, or a POST with no payload) is not valid JSON.
  const body = req.body;
  if (body === null) {
    return { ok: false, reason: "invalid_json" };
  }

  // 3. Stream + count the actual bytes, aborting the moment we exceed the cap.
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop reading immediately — do not buffer the rest of an oversized body.
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    // A transport error mid-read (dropped connection, etc.) — treat the body as
    // unreadable rather than throwing out of the route.
    return { ok: false, reason: "invalid_json" };
  }

  if (total === 0) {
    return { ok: false, reason: "invalid_json" };
  }

  // 4. Concatenate the collected chunks, decode as UTF-8, and JSON.parse.
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8").decode(buf);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
