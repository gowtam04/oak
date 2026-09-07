/**
 * `POST /api/teams/import` — Showdown paste → living Champions team
 * (Champions-first P4).
 *
 * Always champions; Tera dropped; EV numbers stored as Stat Points; over 66/32
 * is warn-but-allow; off-roster names saved with a warning, not rejected.
 *
 * Refs: CF-TEAM-US-3, CF-TEAM-AC-3.1–3.4, CF-DATA-BR-9, ADR-7.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../../test/support/pg";

import type { TeamMember } from "@/data/teams/team-schema";

const ACCT_A = "acct-a";
const CH = "champions";
const SV = "scarlet-violet";

type ImportRoute = typeof import("./route");

let fix: PgFixture;
let imp: ImportRoute;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  imp = await import("./route");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

const post = (body: unknown) =>
  new Request("http://t/api/teams/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

interface ImportBody {
  team: { id: string; name: string; format: string; members: TeamMember[] };
  validation: { code: string }[];
  notes?: { kind: string; raw: string }[];
}

function storedText(value: string | null | undefined, raw: string): void {
  expect(value, `expected stored text for "${raw}"`).toBeTruthy();
  const got = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  expect(got).toContain(want);
}

describe("POST /api/teams/import", () => {
  it("401s a guest", async () => {
    guest();
    expect((await imp.POST(post({ paste: "Garchomp" }))).status).toBe(401);
  });

  it("imports as champions without requiring format (CF-DATA-BR-9)", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: [
          "Garchomp @ Leftovers",
          "Ability: Rough Skin",
          "Tera Type: Dragon",
          "EVs: 252 Atk / 4 Def / 252 Spe",
          "Adamant Nature",
          "- Earthquake",
        ].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.format).toBe(CH);
    expect(out.team.members[0]?.species).toBe("garchomp");
  });

  it("ignores a requested other-game format", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({ format: SV, paste: "Garchomp\nAbility: Rough Skin\n- Earthquake" }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as ImportBody).team.format).toBe(CH);
  });

  it("drops Tera and forces level 50 (CF-TEAM-AC-3.1, ADR-7)", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: [
          "Garchomp",
          "Ability: Rough Skin",
          "Level: 100",
          "Tera Type: Dragon",
          "Adamant Nature",
          "- Earthquake",
        ].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.members[0]?.tera_type).toBeNull();
    expect(out.team.members[0]?.level).toBe(50);
  });

  it("stores EV numbers as Stat Points and warns over 66/32 (CF-TEAM-AC-3.2)", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: [
          "Garchomp",
          "Ability: Rough Skin",
          "EVs: 252 Atk / 4 HP / 252 Spe",
          "Adamant Nature",
          "- Earthquake",
        ].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.format).toBe(CH);
    expect(out.team.members[0]?.evs).toMatchObject({ atk: 252, spe: 252, hp: 4 });
    const codes = out.validation.map((w) => w.code);
    expect(codes).toContain("ev_stat_exceeded");
    expect(codes).toContain("ev_total_exceeded");
  });

  it("keeps off-roster names as stored text with a warning; does not reject (CF-TEAM-AC-3.3)", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: [
          "Notarealmon @ Leftovers",
          "Ability: Rough Skin",
          "Adamant Nature",
          "- Earthquake",
          "- Hyper Nonsense",
        ].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.format).toBe(CH);
    storedText(out.team.members[0]?.species, "Notarealmon");
    storedText(
      out.team.members[0]?.moves.find((m) => /hyper/i.test(m)) ?? null,
      "Hyper Nonsense",
    );
    expect(out.validation.map((w) => w.code)).toContain("species_illegal");
    expect(
      out.validation.find((w) => w.code === "species_illegal")?.message,
    ).toMatch(/not in the Champions roster/);
  });

  it("EV > 255 from @pkmn is a SAFE 200 (clamped, not a 500); cap is a warning", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: [
          "Garchomp",
          "Ability: Rough Skin",
          "EVs: 300 Atk",
          "Adamant Nature",
          "- Earthquake",
        ].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.members[0]?.evs.atk).toBeLessThanOrEqual(255);
    expect(out.validation.map((w) => w.code)).toContain("ev_stat_exceeded");
  });

  it("out-of-range level is a SAFE 200 — team NOT wiped; living import is level 50", async () => {
    signedIn(ACCT_A);
    const res = await imp.POST(
      post({
        paste: ["Garchomp", "Level: 150", "Ability: Rough Skin", "- Earthquake"].join("\n"),
      }),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as ImportBody;
    expect(out.team.members).toHaveLength(1);
    expect(out.team.members[0]?.species).toBe("garchomp");
    expect(out.team.members[0]?.level).toBe(50);
  });

  it("400s a missing paste", async () => {
    signedIn(ACCT_A);
    expect((await imp.POST(post({}))).status).toBe(400);
  });
});
