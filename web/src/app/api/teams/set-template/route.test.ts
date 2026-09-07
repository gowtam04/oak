/**
 * Route-adapter tests for POST /api/teams/set-template (Champions-first P5).
 *
 * Apply-set HTTP contract (CF-TEAM-US-6, CF-TEAM-AC-6.5–6.6, api-design.md):
 *   - request `{ species }` only; old `{ format, species }` ignores format
 *   - public read (no auth) — applying onto a team is a later signed-in PATCH
 *   - 200 `found: false` if usage is down or no set (never 5xx)
 *
 * `resolveSetTemplate` is mocked so this file pins the adapter, not mapping
 * (see `src/server/teams/set-template.test.ts`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const resolveSetTemplate = vi.hoisted(() => vi.fn());

vi.mock("@/server/teams/set-template", () => ({
  resolveSetTemplate: (...args: unknown[]) => resolveSetTemplate(...args),
}));

vi.mock("@/data/db", () => ({ db: {} }));

import { POST } from "./route";
import { _resetStoreForTests } from "@/server/rate-limit";

function post(body: unknown): Request {
  return new Request("http://test.local/api/teams/set-template", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetStoreForTests();
  resolveSetTemplate.mockReset();
  resolveSetTemplate.mockResolvedValue({
    found: true,
    member: {
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake", "protect"],
      nature: "jolly",
      evs: { hp: 32, atk: 0, def: 0, spa: 0, spd: 2, spe: 32 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      tera_type: null,
      level: 50,
    },
    attribution: "ATTR",
  });
});

describe("POST /api/teams/set-template (CF-TEAM-US-6, CF-TEAM-AC-6.5)", () => {
  it("accepts { species } only — format is not required", async () => {
    const res = await POST(post({ species: "garchomp" }));
    expect(res.status).toBe(200);
    expect(resolveSetTemplate).toHaveBeenCalled();
    const args = resolveSetTemplate.mock.calls[0];
    expect(args[0]).toBe("garchomp");
    // New signature is (species, db). Format is not a picker.
    expect(args).not.toContain("gen-7");
    expect(args).not.toContain("national-dex");
    expect(args).not.toContain("scarlet-violet");
  });

  it("ignores a leftover format field (always Champions live usage)", async () => {
    const res = await POST(
      post({ species: "garchomp", format: "gen-7" }),
    );
    expect(res.status).toBe(200);
    const args = resolveSetTemplate.mock.calls[0];
    expect(args[0]).toBe("garchomp");
    expect(args).not.toContain("gen-7");
    const body = (await res.json()) as { found: boolean };
    expect(body.found).toBe(true);
  });

  it("is public — no auth gate on the read", async () => {
    const res = await POST(
      post({ species: "garchomp", format: "champions" }),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect((await res.json()) as { found: boolean }).toMatchObject({
      found: true,
    });
  });

  it("returns 200 found:false when usage is down (CF-TEAM-AC-6.5)", async () => {
    resolveSetTemplate.mockResolvedValue({
      found: false,
      notes: ["Usage is unavailable."],
    });

    const res = await POST(
      post({ species: "garchomp", format: "champions" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      found: boolean;
      member?: unknown;
      notes?: string[];
    };
    expect(body.found).toBe(false);
    expect(body.member).toBeUndefined();
    expect(body.notes?.join(" ").toLowerCase()).toMatch(
      /unavailable|no set|not listed/,
    );
  });

  it("400s when species is missing", async () => {
    const res = await POST(post({ format: "champions" }));
    expect(res.status).toBe(400);
    expect(resolveSetTemplate).not.toHaveBeenCalled();
  });
});
