/**
 * Unit tests for the shared client-IP derivation (assessment finding S1).
 *
 * The security property under test: a client-supplied (leftmost) `X-Forwarded-For`
 * hop must NEVER be returned when a trusted source is available. Behind Fly the
 * edge appends the real client IP, so the trusted hop is `Fly-Client-IP` (primary)
 * or the rightmost XFF hop — never the leftmost, which the attacker controls.
 */

import { describe, expect, it } from "vitest";

import { clientIp } from "./client-ip";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/chat", { method: "POST", headers });
}

describe("clientIp", () => {
  it("trusts Fly-Client-IP over a spoofed leftmost X-Forwarded-For", () => {
    // Attacker forges both the leftmost XFF hop and X-Real-IP; Fly-Client-IP
    // (set by the edge, unspoofable) must win.
    const req = reqWith({
      "Fly-Client-IP": "10.0.0.1",
      "X-Forwarded-For": "6.6.6.6, 203.0.113.7",
      "X-Real-IP": "7.7.7.7",
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("ignores the forged leftmost hop and returns the rightmost (proxy-appended) hop", () => {
    // No Fly-Client-IP: `6.6.6.6` is attacker-supplied, `203.0.113.7` is what the
    // trusted proxy appended. We must return the latter.
    const req = reqWith({ "X-Forwarded-For": "6.6.6.6, 203.0.113.7" });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("returns the rightmost hop of a longer X-Forwarded-For chain", () => {
    const req = reqWith({
      "X-Forwarded-For": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIp(req)).toBe("150.172.238.178");
  });

  it("returns the single hop of a one-element X-Forwarded-For", () => {
    const req = reqWith({ "X-Forwarded-For": "198.51.100.23" });
    expect(clientIp(req)).toBe("198.51.100.23");
  });

  it("trims whitespace and drops empty hops, returning the rightmost non-empty hop", () => {
    const req = reqWith({ "X-Forwarded-For": " 6.6.6.6 , 203.0.113.7 , " });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP when Fly-Client-IP and X-Forwarded-For are absent", () => {
    const req = reqWith({ "X-Real-IP": "198.51.100.9" });
    expect(clientIp(req)).toBe("198.51.100.9");
  });

  it("skips an empty/whitespace Fly-Client-IP and uses the trusted XFF hop", () => {
    const req = reqWith({
      "Fly-Client-IP": "   ",
      "X-Forwarded-For": "6.6.6.6, 203.0.113.7",
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("skips an all-empty X-Forwarded-For and falls back to X-Real-IP", () => {
    const req = reqWith({
      "X-Forwarded-For": " , ",
      "X-Real-IP": "198.51.100.9",
    });
    expect(clientIp(req)).toBe("198.51.100.9");
  });

  it("returns 'unknown' when no forwarding header is present", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});
