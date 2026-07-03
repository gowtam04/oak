/**
 * Unit tests for `readJsonBodyWithLimit` (EDGE-01) — the streaming JSON body
 * reader with a hard byte cap. No DB needed (pure Web-API request handling).
 *
 * The load-bearing case is the CHUNKED body: a `Request` built from a
 * `ReadableStream` carries NO `Content-Length` header, which the old
 * Content-Length-only guard skipped entirely. We assert the streaming byte
 * counter still rejects an over-cap chunked body, and accepts an under-cap one.
 */

import { describe, expect, it } from "vitest";

import { readJsonBodyWithLimit } from "./body-limit";

const enc = new TextEncoder();

/**
 * Build a POST Request whose body is a ReadableStream emitting `chunks` in
 * order — i.e. a CHUNKED request with NO Content-Length header. Node's undici
 * requires `duplex: "half"` for a streaming request body.
 */
function chunkedRequest(chunks: Uint8Array[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Request("http://test.local/x", {
    method: "POST",
    body: stream,
    // @ts-expect-error — `duplex` is required by undici for a stream body but
    // is not yet in the TS lib DOM RequestInit type.
    duplex: "half",
  });
}

/** A plain POST Request with a string body. NOTE: undici does NOT populate a
 *  readable `content-length` header on an in-process Request built this way (the
 *  length is applied at fetch dispatch time), so tests that exercise the
 *  declared-length FAST REJECT set the header explicitly via `chunkedRequest`'s
 *  header arg — a real incoming HTTP request always carries Content-Length. */
function stringRequest(body: string): Request {
  return new Request("http://test.local/x", { method: "POST", body });
}

/** A chunked Request (no intrinsic Content-Length) with an EXPLICIT header set —
 *  models a real incoming request that declares an oversized Content-Length. */
function requestWithDeclaredLength(bytes: number, chunks: Uint8Array[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Request("http://test.local/x", {
    method: "POST",
    body: stream,
    headers: { "content-length": String(bytes) },
    // @ts-expect-error — undici requires `duplex` for a stream body.
    duplex: "half",
  });
}

describe("readJsonBodyWithLimit", () => {
  it("has no Content-Length on a chunked body (guards the bypass premise)", () => {
    const req = chunkedRequest([enc.encode("{}")]);
    expect(req.headers.get("content-length")).toBeNull();
  });

  it("accepts an under-cap chunked body and parses the JSON", async () => {
    const payload = { session_id: "s", message: "hi" };
    const req = chunkedRequest([enc.encode(JSON.stringify(payload))]);
    const res = await readJsonBodyWithLimit(req, 1024);
    expect(res).toEqual({ ok: true, value: payload });
  });

  it("rejects an over-cap CHUNKED body as too_large (the bypass fix)", async () => {
    // ~2 KiB of JSON string content across multiple chunks, cap 512 bytes. No
    // Content-Length header exists, so this can only be caught by the streaming
    // byte counter — exactly the case the old header-only guard missed.
    const big = "x".repeat(2048);
    const json = JSON.stringify({ blob: big });
    const bytes = enc.encode(json);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 256) {
      chunks.push(bytes.slice(i, i + 256));
    }
    const req = chunkedRequest(chunks);
    const res = await readJsonBodyWithLimit(req, 512);
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("fast-rejects a declared Content-Length over the cap without reading", async () => {
    // Models a real incoming request declaring an oversized Content-Length. The
    // cheap header pre-check rejects BEFORE the body stream is read.
    const req = requestWithDeclaredLength(9999, [enc.encode("{}")]);
    expect(Number(req.headers.get("content-length"))).toBe(9999);
    const res = await readJsonBodyWithLimit(req, 512);
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts an under-cap string body", async () => {
    const payload = { ok: true, n: 1 };
    const req = stringRequest(JSON.stringify(payload));
    const res = await readJsonBodyWithLimit(req, 1024);
    expect(res).toEqual({ ok: true, value: payload });
  });

  it("returns invalid_json for a malformed (non-JSON) under-cap body", async () => {
    const req = chunkedRequest([enc.encode("{ not json ")]);
    const res = await readJsonBodyWithLimit(req, 1024);
    expect(res).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns invalid_json for an empty body", async () => {
    const req = chunkedRequest([]);
    const res = await readJsonBodyWithLimit(req, 1024);
    expect(res).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns invalid_json when there is no body at all (GET)", async () => {
    const req = new Request("http://test.local/x", { method: "GET" });
    const res = await readJsonBodyWithLimit(req, 1024);
    expect(res).toEqual({ ok: false, reason: "invalid_json" });
  });
});
