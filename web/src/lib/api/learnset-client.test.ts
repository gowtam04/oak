/**
 * Unit tests for `fetchLearnset` — `fetch` is stubbed, so these are pure (no
 * network, no DB). Pins: URL construction, the F1 metadata fields
 * (type/damage_class/power) riding through when present, defensive narrowing
 * of a malformed body (never throws — folds to `[]` or drops the bad field),
 * and the never-throws contract on a non-2xx / network failure.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLearnset } from "./learnset-client";

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  fetchMock = vi.fn((url: unknown) => Promise.resolve(handler(String(url))));
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLearnset — URL + happy path", () => {
  it("requests /api/learnset with the format + pokemon params", async () => {
    installFetch(() => ok({ moves: [] }));
    await fetchLearnset("scarlet-violet", "garchomp");
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/learnset?");
    expect(url).toContain("format=scarlet-violet");
    expect(url).toContain("pokemon=garchomp");
  });

  it("carries the F1 metadata fields through when present", async () => {
    installFetch(() =>
      ok({
        moves: [
          {
            slug: "earthquake",
            display_name: "Earthquake",
            type: "ground",
            damage_class: "physical",
            power: 100,
          },
        ],
      }),
    );
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves).toEqual([
      {
        slug: "earthquake",
        display_name: "Earthquake",
        type: "ground",
        damage_class: "physical",
        power: 100,
      },
    ]);
  });

  it("preserves a status move's null power distinctly from an absent field", async () => {
    installFetch(() =>
      ok({
        moves: [
          {
            slug: "splash",
            display_name: "Splash",
            type: "normal",
            damage_class: "status",
            power: null,
          },
        ],
      }),
    );
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves[0]).toMatchObject({ damage_class: "status", power: null });
  });
});

describe("fetchLearnset — defensive narrowing (never throws)", () => {
  it("drops malformed metadata fields rather than surfacing garbage", async () => {
    installFetch(() =>
      ok({
        moves: [
          {
            slug: "tackle",
            display_name: "Tackle",
            type: 123, // wrong type — dropped
            damage_class: "not-a-real-class", // invalid enum value — dropped
            power: "40", // wrong type — dropped
          },
        ],
      }),
    );
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves).toEqual([{ slug: "tackle", display_name: "Tackle" }]);
  });

  it("still yields a valid option when metadata is entirely absent", async () => {
    installFetch(() =>
      ok({ moves: [{ slug: "tackle", display_name: "Tackle" }] }),
    );
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves).toEqual([{ slug: "tackle", display_name: "Tackle" }]);
  });

  it("a malformed move entry (missing required fields) is filtered out, not thrown", async () => {
    installFetch(() =>
      ok({ moves: [{ slug: "tackle" }, { display_name: "no slug" }] }),
    );
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves).toEqual([]);
  });

  it("a non-2xx response folds to []", async () => {
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    const moves = await fetchLearnset("scarlet-violet", "garchomp");
    expect(moves).toEqual([]);
  });

  it("a network failure folds to [] instead of throwing", async () => {
    fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchLearnset("scarlet-violet", "garchomp"),
    ).resolves.toEqual([]);
  });

  it("a blank species slug short-circuits to [] without calling fetch", async () => {
    installFetch(() => ok({ moves: [] }));
    const moves = await fetchLearnset("scarlet-violet", "   ");
    expect(moves).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
