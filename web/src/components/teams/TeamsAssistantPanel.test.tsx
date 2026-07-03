/**
 * TeamsAssistantPanel — component tests (jsdom). The SSE hook is mocked (a
 * controllable fake), so these cover rendering + the Apply/Undo draft seam,
 * never the network. Client-safe imports only (no db/repos/runtime).
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import type {
  AssistantTurn,
  UseTeamsAssistantReturn,
} from "@/lib/sse/teams-assistant-sse-client";
import type { TeamMember } from "@/data/teams/team-schema";
import type { TeamPatch } from "@/agent/teams-assistant/schemas";

// Controllable fake for the SSE hook.
const fakeAssistant: UseTeamsAssistantReturn = {
  turns: [],
  status: "idle",
  activity: null,
  streamingMarkdown: "",
  error: null,
  send: vi.fn(async () => {}),
  reset: vi.fn(),
};

vi.mock("@/lib/sse/teams-assistant-sse-client", () => ({
  useTeamsAssistant: () => fakeAssistant,
}));

import TeamsAssistantPanel, { describePatch } from "./TeamsAssistantPanel";

afterEach(() => cleanup());

function member(species: string, item = "leftovers"): TeamMember {
  return {
    species,
    ability: "intimidate",
    item,
    moves: ["thunderbolt", "protect"],
    nature: "modest",
    evs: { hp: 32, atk: 0, def: 2, spa: 32, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    nickname: null,
  };
}

const patch: TeamPatch = {
  slots: [{ slot: 1, member: member("camerupt") }],
};

function answeredTurn(id = 1, withPatch = true): AssistantTurn {
  return {
    id,
    user: "fix my camerupt",
    answer: {
      answer_markdown: "Here is a better **Camerupt** set.",
      ...(withPatch ? { team_patch: patch } : {}),
    },
  };
}

function setup(
  overrides: Partial<React.ComponentProps<typeof TeamsAssistantPanel>> = {},
) {
  const draft = { name: "Test", members: [member("absol-mega", "absolite")] };
  const props: React.ComponentProps<typeof TeamsAssistantPanel> = {
    teamId: "t1",
    format: "champions",
    getDraft: vi.fn(() => draft),
    applyPatch: vi.fn(),
    replaceDraft: vi.fn(),
    ...overrides,
  };
  const utils = render(<TeamsAssistantPanel {...props} />);
  return { ...utils, props, draft };
}

beforeEach(() => {
  fakeAssistant.turns = [];
  fakeAssistant.status = "idle";
  fakeAssistant.activity = null;
  fakeAssistant.streamingMarkdown = "";
  fakeAssistant.error = null;
  vi.mocked(fakeAssistant.send).mockClear();
  vi.mocked(fakeAssistant.reset).mockClear();
  try {
    localStorage.clear();
  } catch {
    // jsdom without storage — fine.
  }
});

describe("describePatch", () => {
  it("summarizes set, remove, and rename ops", () => {
    const lines = describePatch({
      name: "New Name",
      slots: [
        { slot: 0, member: member("camerupt") },
        { slot: 2, member: null },
      ],
    });
    expect(lines[0]).toContain("New Name");
    expect(lines[1]).toContain("Slot 1: Camerupt");
    expect(lines[1]).toContain("Thunderbolt / Protect");
    expect(lines[2]).toBe("Slot 3: remove");
  });
});

describe("TeamsAssistantPanel", () => {
  it("renders the empty-state hint and a composer", () => {
    setup();
    expect(screen.getByTestId("assistant-empty")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-input")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-send")).toBeDisabled();
  });

  it("offers first-use suggestion chips that send with the live draft", () => {
    const { props } = setup();
    const chips = screen.getByTestId("assistant-suggestions");
    expect(chips).toBeInTheDocument();
    fireEvent.click(screen.getByText("Check my coverage"));
    expect(props.getDraft).toHaveBeenCalled();
    expect(fakeAssistant.send).toHaveBeenCalledWith(
      "Check my coverage",
      expect.objectContaining({ format: "champions", name: "Test" }),
    );
  });

  it("sends the trimmed message with the live draft (format attached)", () => {
    const { props } = setup();
    fireEvent.change(screen.getByTestId("assistant-input"), {
      target: { value: "  help me  " },
    });
    fireEvent.submit(screen.getByTestId("assistant-input").closest("form")!);
    expect(props.getDraft).toHaveBeenCalled();
    expect(fakeAssistant.send).toHaveBeenCalledWith(
      "help me",
      expect.objectContaining({
        format: "champions",
        name: "Test",
        members: expect.any(Array),
      }),
    );
  });

  it("renders turns: user bubble, answer markdown, and the patch card", () => {
    fakeAssistant.turns = [answeredTurn()];
    setup();
    expect(screen.getByTestId("assistant-user-msg")).toHaveTextContent(
      "fix my camerupt",
    );
    expect(screen.getByTestId("assistant-answer")).toHaveTextContent(
      "Here is a better Camerupt set.",
    );
    const card = screen.getByTestId("assistant-patch-card");
    expect(card).toHaveTextContent("Slot 2: Camerupt");
    expect(screen.getByTestId("assistant-apply")).toBeInTheDocument();
  });

  it("advice-only answers show no patch card", () => {
    fakeAssistant.turns = [answeredTurn(1, false)];
    setup();
    expect(screen.queryByTestId("assistant-patch-card")).toBeNull();
  });

  it("Apply snapshots the draft, applies the patch, then Undo restores it", () => {
    fakeAssistant.turns = [answeredTurn()];
    const { props, draft } = setup();

    fireEvent.click(screen.getByTestId("assistant-apply"));
    expect(props.applyPatch).toHaveBeenCalledWith(patch);
    expect(screen.getByText("Applied to draft ✓")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("assistant-undo"));
    expect(props.replaceDraft).toHaveBeenCalledWith(draft);
    // Back to an applicable state.
    expect(screen.getByTestId("assistant-apply")).toBeInTheDocument();
  });

  it("shows the activity ticker while thinking and a transport error with Retry", () => {
    fakeAssistant.status = "thinking";
    fakeAssistant.activity = "📖 Checking the learnset…";
    const { unmount } = setup();
    expect(screen.getByTestId("assistant-pending")).toHaveTextContent(
      "Checking the learnset",
    );
    unmount();

    fakeAssistant.status = "error";
    fakeAssistant.activity = null;
    fakeAssistant.error = "The assistant hit a transport error.";
    setup();
    expect(screen.getByTestId("assistant-error")).toHaveTextContent(
      "transport error",
    );
  });

  it("collapses to a rail and expands back", () => {
    setup();
    fireEvent.click(screen.getByTestId("assistant-collapse"));
    expect(screen.getByTestId("assistant-panel-collapsed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("assistant-expand"));
    expect(screen.getByTestId("assistant-panel")).toBeInTheDocument();
  });
});
