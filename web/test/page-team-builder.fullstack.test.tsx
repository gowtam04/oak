/**
 * TEAM-BUILDER-UI-E2E (frontend) — `/teams` + proposed_team apply.
 *
 * Champions-first P6b (CF-TEAM-AC-1.2–1.7, CF-TEAM-AC-5.4–5.5, CF-TEAM-AC-6.1–6.4,
 * CF-UI-US-4, CF-UI-US-5, CF-AS-3, CF-AS-11, CF-AUTH-AC-1.2):
 *   - living Champions list + Archived section (view+delete only),
 *   - living editor: no Tera / IV / level knobs; Stat Points 66 / 32,
 *   - Apply this Champions set (empty fill; filled yes/no replace),
 *   - archive view labels off-roster names; no other-game Dex lookup.
 *
 * Renders the REAL pages (`<TeamsPage/>` and `<Home/>`) with a single stubbed
 * `fetch` backed by an in-memory team store. It imports ONLY view + lib code —
 * never db/repos/runtime/server-only (those open Postgres and the Vitest jsdom
 * project has no Testcontainers). Runs in the Vitest jsdom project (the
 * `test/` `.test.tsx` glob).
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import TeamsPage from "@/app/teams/page";
import Home from "@/app/page";
import { formatSseEvent } from "@/lib/sse/sse-types";
import { MINIMAL_ANSWER } from "@/components/test-fixtures";
import type { TeamMember } from "@/data/teams/team-schema";
import type { OakAnswer } from "@/components/types";

const EMAIL = "ash@pallet.town";
const CH = "champions";

interface StoredTeam {
  id: string;
  name: string;
  format: string;
  members: TeamMember[];
}

let store: StoredTeam[];
let nextId: number;
let chatBodies: Array<Record<string, unknown>>;
let nextAnswer: OakAnswer;
let signedIn: boolean;
let fetchUrls: string[];

const spread = (v = 0) => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

function garchompMember(): TeamMember {
  return {
    species: "garchomp",
    ability: "rough-skin",
    item: "leftovers",
    moves: ["earthquake", "dragon-claw", "fire-fang", "stealth-rock"],
    nature: "adamant",
    evs: { ...spread(), atk: 30, spe: 32, hp: 4 },
    ivs: spread(31),
    tera_type: null,
    level: 50,
  };
}

function emptyGarchomp(): TeamMember {
  return {
    species: "garchomp",
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: spread(0),
    ivs: spread(31),
    tera_type: null,
    level: 50,
  };
}

function usageGarchomp(): TeamMember {
  return {
    species: "garchomp",
    ability: "rough-skin",
    item: "life-orb",
    moves: ["earthquake", "dragon-claw", "fire-fang", "protect"],
    nature: "jolly",
    evs: { ...spread(), hp: 4, atk: 30, spe: 32 },
    ivs: spread(31),
    tera_type: null,
    level: 50,
  };
}

function excadrillMember(): TeamMember {
  return {
    species: "excadrill",
    ability: "sand-rush",
    item: "air-balloon",
    moves: ["earthquake", "iron-head", "rock-slide", "toxic"],
    nature: "jolly",
    evs: { ...spread(), atk: 252, spe: 252, hp: 4 },
    ivs: spread(31),
    tera_type: "ground",
    level: 50,
  };
}

function summary(t: StoredTeam) {
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    memberCount: t.members.length,
    incomplete: t.members.length < 6,
    updatedAt: 1,
  };
}

function offRosterWarnings(t: StoredTeam) {
  if (t.format === CH) return [];
  const out: { code: string; message: string; slot: number; field: string }[] =
    [];
  t.members.forEach((m, slot) => {
    if (m.species) {
      out.push({
        code: "species_illegal",
        slot,
        field: "species",
        message: `Species "${m.species}" is not in the Champions roster.`,
      });
    }
    if (m.ability) {
      out.push({
        code: "ability_not_for_species",
        slot,
        field: "ability",
        message: `Ability "${m.ability}" is not in the Champions roster.`,
      });
    }
    if (m.item) {
      out.push({
        code: "item_illegal",
        slot,
        field: "item",
        message: `Item "${m.item}" is not in the Champions roster.`,
      });
    }
    m.moves.forEach((move, i) => {
      out.push({
        code: "move_not_in_learnset",
        slot,
        field: `moves[${i}]`,
        message: `Move "${move}" is not in the Champions roster.`,
      });
    });
  });
  return out;
}

function detail(t: StoredTeam) {
  const validation = [
    ...(t.members.length < 6
      ? [{ code: "incomplete", message: "Add more." }]
      : []),
    ...offRosterWarnings(t),
  ];
  return {
    team: { id: t.id, name: t.name, format: t.format, members: t.members },
    validation,
  };
}

function isLiving(t: StoredTeam) {
  return t.format === CH;
}

function otherGameFormatInUrl(url: string): boolean {
  return /[?&]format=(gen-[1-8]|scarlet-violet|national-dex)\b/.test(url);
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

function sseAnswerResponse(answer: OakAnswer): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(formatSseEvent("answer", { answer })),
      );
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", body } as unknown as Response;
}

/** A minimal in-memory localStorage (this jsdom config provides no real one). */
function makeStorageStub(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
}

beforeEach(() => {
  store = [];
  nextId = 1;
  chatBodies = [];
  nextAnswer = { ...MINIMAL_ANSWER };
  signedIn = true;
  fetchUrls = [];
  vi.stubGlobal("localStorage", makeStorageStub());

  const fetchMock = vi.fn(
    async (url: string, init?: { method?: string; body?: string }) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      const parsed = new URL(u, "http://localhost");
      const path = parsed.pathname;
      fetchUrls.push(`${method} ${path}${parsed.search}`);

      // --- auth ---
      if (path === "/api/auth/me") {
        return signedIn
          ? jsonResponse(200, { signedIn: true, email: EMAIL })
          : jsonResponse(200, { signedIn: false });
      }

      // --- entity / sprites / learnset / search (progressive enhancement) ---
      if (path === "/api/entity") return jsonResponse(404, {});
      if (path === "/api/sprites") return jsonResponse(200, { refs: {} });
      if (path === "/api/learnset") return jsonResponse(200, { moves: [] });
      if (path === "/api/search") return jsonResponse(200, { matches: [] });
      if (path === "/api/teams/analyze") {
        return jsonResponse(200, { status: "unavailable" });
      }

      // --- usage set-template (Apply this Champions set) ---
      if (path === "/api/teams/set-template" && method === "POST") {
        const b = JSON.parse(init!.body ?? "{}") as { species?: string };
        if (!b.species) return jsonResponse(400, { error: "invalid_request" });
        return jsonResponse(200, {
          found: true,
          member: { ...usageGarchomp(), species: b.species },
          attribution: "Live Champions usage",
        });
      }

      // --- chat ---
      if (path === "/api/chat") {
        chatBodies.push(JSON.parse(init!.body!) as Record<string, unknown>);
        return sseAnswerResponse(nextAnswer);
      }

      // --- conversations PATCH (ActiveTeamSelector best-effort persist) ---
      if (path.startsWith("/api/conversations/")) {
        return jsonResponse(200, { ok: true });
      }

      // --- teams ---
      if (path === "/api/teams" && method === "GET") {
        const fmt = parsed.searchParams.get("format");
        const archived = parsed.searchParams.get("archived") === "1";
        const teams = store
          .filter((t) => {
            if (fmt === CH || (!fmt && !archived)) return isLiving(t);
            if (archived) return !isLiving(t);
            if (fmt) return t.format === fmt;
            return isLiving(t);
          })
          .map(summary);
        return jsonResponse(200, { teams });
      }
      if (path === "/api/teams" && method === "POST") {
        const b = JSON.parse(init!.body!) as {
          format?: string;
          name?: string;
          members?: TeamMember[];
        };
        const t: StoredTeam = {
          id: `team-${nextId++}`,
          name: b.name ?? "Untitled team",
          format: CH, // POST ignores client format (P4)
          members: b.members ?? [],
        };
        store.push(t);
        return jsonResponse(200, detail(t));
      }
      if (path === "/api/teams/import" && method === "POST") {
        const t: StoredTeam = {
          id: `team-${nextId++}`,
          name: "Imported team",
          format: CH,
          members: [garchompMember()],
        };
        store.push(t);
        return jsonResponse(200, {
          ...detail(t),
          notes: [
            {
              slot: 1,
              kind: "pokemon",
              raw: "Notarealmon",
              message: "Couldn't resolve.",
            },
          ],
        });
      }
      if (path.startsWith("/api/teams/")) {
        const rest = path.slice("/api/teams/".length);
        const [rawId, sub] = rest.split("/");
        const id = decodeURIComponent(rawId!);
        const t = store.find((x) => x.id === id);

        if (sub === "export") {
          if (!t) return jsonResponse(404, {});
          return jsonResponse(200, { paste: "Garchomp @ Leftovers\n- Earthquake" });
        }
        if (sub === "duplicate") {
          if (!t) return jsonResponse(404, {});
          if (!isLiving(t)) {
            return jsonResponse(409, { code: "archived" });
          }
          const copy: StoredTeam = {
            id: `team-${nextId++}`,
            name: `${t.name} copy`,
            format: t.format,
            members: t.members,
          };
          store.push(copy);
          return jsonResponse(200, detail(copy));
        }
        if (method === "GET") {
          if (!t) return jsonResponse(404, {});
          return jsonResponse(200, detail(t));
        }
        if (method === "PUT") {
          if (!t) return jsonResponse(404, {});
          if (!isLiving(t)) {
            return jsonResponse(409, { code: "archived" });
          }
          const b = JSON.parse(init!.body!) as {
            name?: string;
            members?: TeamMember[];
          };
          if (b.name !== undefined) t.name = b.name;
          if (b.members !== undefined) t.members = b.members;
          return jsonResponse(200, detail(t));
        }
        if (method === "DELETE") {
          store = store.filter((x) => x.id !== id);
          return jsonResponse(200, { ok: true });
        }
      }

      throw new Error(`unexpected fetch: ${method} ${u}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ===========================================================================
// /teams — manual build + Showdown import
// ===========================================================================

describe("/teams — manual build", () => {
  it("creates a team, renames it, adds a member, and saves (TEAM-US-1/3)", async () => {
    render(<TeamsPage />);
    // Signed in → the workbench (not the guest prompt) renders.
    await screen.findByTestId("team-list");
    expect(screen.queryByTestId("teams-guest")).not.toBeInTheDocument();

    // Create a new team → the archetype picker opens first (B-17); choosing
    // "Blank team" creates the empty team and opens the editor on it.
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-new"));
    });
    await screen.findByTestId("archetype-picker");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Blank team" }));
    });
    await screen.findByTestId("team-editor");
    expect(store).toHaveLength(1);

    // Rename + add a member, then Save (partial team is first-class, BR-T4).
    fireEvent.change(screen.getByTestId("team-name"), {
      target: { value: "Ladder Core" },
    });
    fireEvent.click(screen.getByTestId("team-add-member"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-save"));
    });

    await waitFor(() => {
      expect(store[0].name).toBe("Ladder Core");
      expect(store[0].members).toHaveLength(1);
    });
  });

  it("imports a Showdown paste, surfaces notes, and opens the imported team (TEAM-US-10)", async () => {
    render(<TeamsPage />);
    await screen.findByTestId("team-list");

    // Open the import dialog and submit a paste.
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-import"));
    });
    await screen.findByTestId("import-dialog");
    fireEvent.change(screen.getByTestId("import-text"), {
      target: { value: "Garchomp @ Leftovers\n- Earthquake\n\nNotarealmon\n- Splash" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("import-submit"));
    });

    // Import succeeded → the page saves the team, closes the dialog, and opens
    // the imported team in the editor (per-slot notes are surfaced by the
    // dialog unit test; the page flow closes the dialog on success).
    const editor = await screen.findByTestId("team-editor");
    expect(within(editor).getByTestId("team-name")).toHaveValue("Imported team");
    expect(store).toHaveLength(1);
    expect(store[0].members[0].species).toBe("garchomp");
  });
});

// ===========================================================================
// chat — set an active team + apply a proposed_team
// ===========================================================================

describe("chat — active team + proposed_team apply", () => {
  function seedTeam(name: string): StoredTeam {
    const t: StoredTeam = {
      id: `team-${nextId++}`,
      name,
      format: CH,
      members: [garchompMember()],
    };
    store.push(t);
    return t;
  }

  it("applies a proposed_team — save-new (createTeam) and apply-existing (updateTeam)", async () => {
    const existing = seedTeam("Overwrite Me");
    const proposedMembers = [garchompMember()];
    nextAnswer = {
      ...MINIMAL_ANSWER,
      answer_markdown: "Here's a team you could try.",
      proposed_team: {
        name: "Proposed Rain",
        format: CH,
        members: proposedMembers,
      },
    };

    render(<Home />);
    // Wait until the signed-in chat shell has rendered (the Teams link is
    // signed-in-only) before driving the composer.
    await screen.findByRole("link", { name: "Teams" });

    // Ask for a build → the answer carries a proposed_team rendered as a card.
    fireEvent.change(screen.getByTestId("composer-input"), {
      target: { value: "build me a team" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });

    const card = await screen.findByTestId("proposed-team");
    expect(within(card).getByTestId("proposed-team-name")).toHaveTextContent(
      "Proposed Rain",
    );

    // --- Save as a NEW team (createTeam) -----------------------------------
    await act(async () => {
      fireEvent.click(within(card).getByTestId("proposed-team-save-new"));
    });
    await waitFor(() =>
      expect(store.some((t) => t.name === "Proposed Rain")).toBe(true),
    );
    const saved = store.find((t) => t.name === "Proposed Rain")!;
    expect(saved.format).toBe(CH);
    expect(saved.members).toHaveLength(1);

    // --- Apply onto the EXISTING same-format team (updateTeam) --------------
    // The card listed `existing` (same format) as an overwrite target.
    const target = (await within(card).findByTestId(
      "proposed-team-target",
    )) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(target, { target: { value: existing.id } });
    });
    await act(async () => {
      fireEvent.click(within(card).getByTestId("proposed-team-apply-existing"));
    });

    await waitFor(() =>
      expect(within(card).getByTestId("proposed-team-status")).toHaveTextContent(
        /Overwrite Me/,
      ),
    );
    // The existing team's members were replaced with the proposed set.
    const after = store.find((t) => t.id === existing.id)!;
    expect(after.members).toHaveLength(1);
    expect(after.members[0].species).toBe("garchomp");
  });
});

function seedLiving(name: string, members: TeamMember[]): StoredTeam {
  const t: StoredTeam = {
    id: `team-${nextId++}`,
    name,
    format: CH,
    members,
  };
  store.push(t);
  return t;
}

function seedArchived(name: string, format: string, members: TeamMember[]): StoredTeam {
  const t: StoredTeam = {
    id: `arch-${nextId++}`,
    name,
    format,
    members,
  };
  store.push(t);
  return t;
}

function queryReplaceConfirm() {
  return (
    screen.queryByTestId("apply-set-confirm") ??
    screen.queryByRole("alertdialog") ??
    screen.queryByRole("dialog", { name: /replace/i })
  );
}

function applySetButton() {
  return (
    screen.queryByRole("button", { name: /apply this champions set/i }) ??
    screen.queryByTestId("member-0-apply-set") ??
    screen.queryByTestId("member-0-common-set")
  );
}

describe("/teams — guest (CF-AUTH-AC-1.2, CF-AS-11)", () => {
  it("asks a guest to sign in; no team is created or mutated", async () => {
    signedIn = false;
    seedLiving("Should not list", [garchompMember()]);
    render(<TeamsPage />);
    const guest = await screen.findByTestId("teams-guest");
    expect(guest).toHaveTextContent(/sign in/i);
    expect(screen.queryByTestId("team-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-new")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-import")).not.toBeInTheDocument();
    expect(applySetButton()).not.toBeInTheDocument();
    expect(fetchUrls.some((u) => u.startsWith("POST /api/teams"))).toBe(false);
    expect(fetchUrls.some((u) => u.startsWith("PUT /api/teams"))).toBe(false);
  });
});

describe("/teams — living list + archive (CF-TEAM-AC-1.7, CF-TEAM-US-5, CF-UI-US-4)", () => {
  it("shows living Champions teams as the primary list; other-format teams are not mixed in (CF-TEAM-AC-1.7, CF-UI-AC-4.1)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    seedArchived("Gen 7 rain", "gen-7", [excadrillMember()]);
    render(<TeamsPage />);
    await screen.findByText("Ladder Core");
    const living =
      screen.queryByTestId("team-list-living") ??
      screen.getByTestId("team-list-items");
    expect(within(living).getByText("Ladder Core")).toBeInTheDocument();
    expect(within(living).queryByText("Gen 7 rain")).not.toBeInTheDocument();
  });

  it("has no format picker listing other games (CF-TEAM-AC-1.1, CF-UI-AC-1.1)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    render(<TeamsPage />);
    await screen.findByTestId("team-list");
    expect(screen.queryByTestId("teams-format")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /National Dex/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Scarlet\/Violet/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /format/i }),
    ).not.toBeInTheDocument();
  });

  it("creates a new team as Champions with no format picker (CF-TEAM-AC-1.1)", async () => {
    render(<TeamsPage />);
    await screen.findByTestId("team-list");
    await act(async () => {
      fireEvent.click(screen.getByTestId("team-new"));
    });
    await screen.findByTestId("archetype-picker");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Blank team" }));
    });
    await screen.findByTestId("team-editor");
    expect(store).toHaveLength(1);
    expect(store[0].format).toBe(CH);
  });

  it("renders Archived as a separate section with view + delete only (CF-TEAM-AC-5.1–5.3, CF-UI-AC-4.2)", async () => {
    const living = seedLiving("Ladder Core", [garchompMember()]);
    const archived = seedArchived("Gen 7 rain", "gen-7", [excadrillMember()]);
    render(<TeamsPage />);
    await screen.findByText("Ladder Core");
    const archive = screen.getByTestId("team-list-archived");
    expect(archive).toHaveTextContent(/archived/i);
    expect(within(archive).getByText("Gen 7 rain")).toBeInTheDocument();
    expect(
      within(archive).queryByTestId(`team-duplicate-${archived.id}`),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", { name: /duplicate/i }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", { name: /edit/i }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", {
        name: /apply( this)?( champions)? set/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).queryByRole("button", {
        name: /use in chat|bind|active team/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).getByTestId(`team-delete-${archived.id}`),
    ).toBeInTheDocument();

    expect(fetchUrls.some((u) => u.includes("archived=1"))).toBe(true);

    // Duplicate must not fire for the archived row (409 if the UI slipped).
    const before = store.length;
    expect(
      screen.queryByTestId(`team-duplicate-${archived.id}`),
    ).not.toBeInTheDocument();
    expect(store.filter((t) => t.id === living.id)).toHaveLength(1);
    expect(store).toHaveLength(before);
  });

  it("deletes an archived team after confirm (CF-TEAM-AC-5.2)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    const archived = seedArchived("Gen 7 rain", "gen-7", [excadrillMember()]);
    render(<TeamsPage />);
    await screen.findByText("Ladder Core");
    const archive = screen.getByTestId("team-list-archived");
    fireEvent.click(within(archive).getByTestId(`team-delete-${archived.id}`));
    fireEvent.click(
      within(archive).getByTestId(`team-delete-confirm-${archived.id}`),
    );
    await waitFor(() =>
      expect(store.find((t) => t.id === archived.id)).toBeUndefined(),
    );
  });

  it("omits Archived (or leaves it empty, no error) when there are none (CF-TEAM-AC-5.5)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    render(<TeamsPage />);
    await screen.findByText("Ladder Core");
    await waitFor(() =>
      expect(fetchUrls.some((u) => u.includes("/api/teams"))).toBe(true),
    );
    const archive = screen.queryByTestId("team-list-archived");
    if (archive) {
      expect(archive).not.toHaveTextContent(/error|failed|couldn't/i);
      expect(within(archive).queryByTestId(/team-row-/)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("/teams — living editor knobs (CF-TEAM-AC-1.2–1.3, CF-UI-AC-1.3)", () => {
  it("has no Tera, IV, or level knobs and shows a Stat Point running total", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    render(<TeamsPage />);
    await screen.findByTestId("team-editor");
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-hp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-level")).not.toBeInTheDocument();
    expect(screen.getByText(/stat points/i)).toBeInTheDocument();
    expect(screen.getByTestId("member-0-ev-total")).toHaveTextContent("/ 66");
    expect(screen.getByTestId("member-0-ev-spe")).toHaveAttribute("max", "32");
  });
});

describe("/teams — Apply this Champions set (CF-TEAM-US-6, CF-UI-US-5)", () => {
  it("fills an empty slot from the usage set (CF-TEAM-AC-6.1–6.2)", async () => {
    seedLiving("Ladder Core", [emptyGarchomp()]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TeamsPage />);
    await screen.findByTestId("team-editor");
    const btn = applySetButton();
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/apply this champions set/i);
    await act(async () => {
      fireEvent.click(btn!);
    });
    await waitFor(() =>
      expect(screen.getByTestId("member-0-ability")).toHaveValue("Rough Skin"),
    );
    expect(screen.getByTestId("member-0-item")).toHaveValue("Life Orb");
    expect(screen.getByTestId("member-0-nature")).toHaveValue("Jolly");
    expect(screen.getByTestId("member-0-move-0")).toHaveValue("Earthquake");
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(queryReplaceConfirm()).not.toBeInTheDocument();
  });

  it("asks yes/no replace on a filled slot; cancel leaves the slot (CF-TEAM-AC-6.3, CF-UI-AC-5.1–5.2, CF-AS-3)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TeamsPage />);
    await screen.findByTestId("team-editor");
    expect(screen.getByTestId("member-0-item")).toHaveValue("Leftovers");
    await act(async () => {
      fireEvent.click(applySetButton()!);
    });
    const ui = queryReplaceConfirm();
    if (ui) {
      expect(ui).toHaveTextContent(/replace/i);
      expect(ui.textContent ?? "").not.toMatch(/→|ability:|item:|nature:/i);
      fireEvent.click(
        within(ui).getByRole("button", { name: /cancel|no|keep/i }),
      );
    } else {
      expect(confirmSpy).toHaveBeenCalled();
      const msg = String(confirmSpy.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/replace/i);
      expect(msg).not.toMatch(/ability:|item:|nature:|→/i);
    }
    expect(screen.getByTestId("member-0-item")).toHaveValue("Leftovers");
    expect(screen.getByTestId("member-0-ability")).toHaveValue("Rough Skin");
  });

  it("replaces the filled slot on confirm without Tera (CF-TEAM-AC-6.3, CF-UI-AC-5.3)", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TeamsPage />);
    await screen.findByTestId("team-editor");
    await act(async () => {
      fireEvent.click(applySetButton()!);
    });
    const ui = queryReplaceConfirm();
    if (ui) {
      const go =
        within(ui).queryByRole("button", {
          name: /^(replace|confirm|yes|overwrite)$/i,
        }) ??
        within(ui).getByRole("button", { name: /replace|overwrite|yes/i });
      await act(async () => {
        fireEvent.click(go);
      });
    } else {
      expect(confirmSpy).toHaveBeenCalled();
    }
    await waitFor(() =>
      expect(screen.getByTestId("member-0-item")).toHaveValue("Life Orb"),
    );
    expect(screen.getByTestId("member-0-nature")).toHaveValue("Jolly");
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
  });
});

describe("/teams — archive view (CF-TEAM-AC-5.4, CF-UI-AC-4.3)", () => {
  it("opens an archived team as view-only with off-roster labels and no other-game Dex lookup", async () => {
    seedLiving("Ladder Core", [garchompMember()]);
    const archived = seedArchived("Gen 7 rain", "gen-7", [excadrillMember()]);
    render(<TeamsPage />);
    await screen.findByText("Ladder Core");
    const archive = screen.getByTestId("team-list-archived");
    await act(async () => {
      fireEvent.click(within(archive).getByTestId(`team-open-${archived.id}`));
    });
    const editor = await screen.findByTestId("team-editor");
    const nameEl = within(editor).getByTestId("team-name");
    expect(
      (nameEl as HTMLInputElement).value || nameEl.textContent,
    ).toMatch(/Gen 7 rain/);
    expect(editor).toHaveTextContent(/excadrill/i);
    expect(editor).toHaveTextContent(/not in the Champions roster/);
    expect(screen.queryByTestId("team-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-add-member")).not.toBeInTheDocument();
    expect(applySetButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("assistant-panel-collapsed"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/try Scarlet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/switch scope/i)).not.toBeInTheDocument();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const lookupUrls = fetchUrls.filter(
      (u) =>
        u.includes("/api/sprites") ||
        u.includes("/api/learnset") ||
        u.includes("/api/entity") ||
        u.includes("/api/search"),
    );
    expect(lookupUrls.some(otherGameFormatInUrl)).toBe(false);
  });
});
