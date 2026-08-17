import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  act,
  fireEvent,
} from "@testing-library/react";

afterEach(() => cleanup());
import ChatThread, { instrumentToken } from "./ChatThread";
import type { ChatThreadProps } from "@/components/types";
import { STARTER_PROMPTS } from "@/lib/example-prompts";

import { RESOLUTION_FAILED_ANSWER } from "@/components/test-fixtures";

/** Minimal props with sensible defaults; override per test. */
function props(overrides: Partial<ChatThreadProps> = {}): ChatThreadProps {
  return {
    turns: [],
    activity: [],
    status: "idle",
    streamingMarkdown: "",
    transportError: null,
    onFollowUp: () => {},
    ...overrides,
  };
}

describe("ChatThread — in-flight streaming bubble", () => {
  it("renders the streaming answer (as markdown) while streaming", () => {
    render(
      <ChatThread
        {...props({
          status: "streaming",
          streamingMarkdown: "Only **Ninetales** can learn both.",
        })}
      />,
    );
    const bubble = screen.getByTestId("streaming-answer");
    expect(bubble).toBeInTheDocument();
    // Markdown is rendered (bold → <strong>), not raw asterisks.
    expect(bubble.querySelector("strong")).toHaveTextContent("Ninetales");
    expect(within(bubble).queryByText(/\*\*/)).toBeNull();
  });

  it("does not render the streaming bubble when streamingMarkdown is empty", () => {
    render(<ChatThread {...props({ status: "streaming", streamingMarkdown: "" })} />);
    expect(screen.queryByTestId("streaming-answer")).not.toBeInTheDocument();
    // The thinking indicator still shows.
    expect(screen.getByTestId("progress-thinking")).toBeInTheDocument();
  });

  it("does not render the streaming bubble when idle", () => {
    render(
      <ChatThread
        {...props({ status: "idle", streamingMarkdown: "leftover text" })}
      />,
    );
    expect(screen.queryByTestId("streaming-answer")).not.toBeInTheDocument();
  });
});

describe("ChatThread — empty-state blank specimen plate", () => {
  it("renders a Signal empty hero (not STANDBY, not a logo)", () => {
    render(<ChatThread {...props({ turns: [], status: "idle" })} />);
    expect(screen.getByTestId("blank-plate")).toBeInTheDocument();
    expect(screen.queryByText("STANDBY")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What do you want to know?",
    );
    expect(
      screen.getByText(
        "Mechanics, locations, teams, damage. Oak will show its work.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Oak")).not.toBeInTheDocument();
  });

  it("renders exactly 4 starter rows from the prompt pool with categories", () => {
    render(<ChatThread {...props({ turns: [], status: "idle" })} />);
    const chips = screen.getAllByTestId("chat-empty-example");
    expect(chips).toHaveLength(4);
    const categories = new Set(["Battle", "Dex", "Rules", "Meta"]);
    for (const chip of chips) {
      const prompt = chip.getAttribute("data-prompt");
      expect(prompt).toBeTruthy();
      expect(STARTER_PROMPTS).toContain(prompt);
      expect(categories.has(chip.getAttribute("data-category") ?? "")).toBe(
        true,
      );
      expect(chip.querySelector(".starter__cat")).toBeTruthy();
      expect(chip.querySelector(".starter__text")?.textContent).toBe(prompt);
    }
    const shown = chips.map((c) => c.getAttribute("data-prompt"));
    expect(new Set(shown).size).toBe(4);
  });

  it("shows no empty plate once the conversation has turns", () => {
    render(
      <ChatThread
        {...props({ turns: [{ id: "u1", role: "user", content: "hi" }] })}
      />,
    );
    expect(screen.queryByTestId("chat-empty")).toBeNull();
    expect(screen.queryByTestId("chat-empty-example")).toBeNull();
    expect(screen.queryByTestId("chat-empty-scope-hint")).toBeNull();
  });

  it("does not render the scope stamp when no scopeChipSlot is provided", () => {
    render(<ChatThread {...props({ turns: [], status: "idle" })} />);
    expect(screen.queryByTestId("chat-empty-scope-hint")).toBeNull();
  });

  it("does not clone the scope chip onto the empty plate", () => {
    render(
      <ChatThread
        {...props({
          turns: [],
          status: "idle",
          scopeChipSlot: <span data-testid="scope-chip-slot" />,
        })}
      />,
    );
    expect(screen.queryByTestId("chat-empty-scope-hint")).toBeNull();
    expect(screen.queryByTestId("scope-chip-slot")).toBeNull();
  });
});

describe("ChatThread — empty-state composer promotion (screen 01)", () => {
  it("renders the composer slot inside the empty hero when provided (desktop)", () => {
    render(
      <ChatThread
        {...props({
          turns: [],
          status: "idle",
          composerSlot: <div data-testid="hero-composer-slot" />,
        })}
      />,
    );
    const empty = screen.getByTestId("chat-empty");
    expect(empty.className).toContain("chat-empty--hero");
    expect(within(empty).getByTestId("hero-composer-slot")).toBeInTheDocument();
    expect(within(empty).getByTestId("blank-plate")).toBeInTheDocument();
  });

  it("omits the hero composer (docked mode) when no slot is passed (mobile / non-empty)", () => {
    render(<ChatThread {...props({ turns: [], status: "idle" })} />);
    const empty = screen.getByTestId("chat-empty");
    expect(empty.className).not.toContain("chat-empty--hero");
    expect(screen.queryByTestId("hero-composer-slot")).toBeNull();
  });
});

describe("ChatThread — user-turn image thumbnails", () => {
  it("renders attached-image thumbnails from imagePreviews, keyed by turn id", () => {
    render(
      <ChatThread
        {...props({
          turns: [{ id: "u1", role: "user", content: "rate my team" }],
          imagePreviews: {
            u1: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
          },
        })}
      />,
    );
    const strip = screen.getByTestId("user-turn-images");
    const imgs = within(strip).getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute("src", "data:image/png;base64,AAA");
    // The text still renders alongside the thumbnails.
    expect(screen.getByText("rate my team")).toBeInTheDocument();
  });

  it("renders an image-only user turn (empty text) with no empty text bubble", () => {
    render(
      <ChatThread
        {...props({
          turns: [{ id: "u2", role: "user", content: "" }],
          imagePreviews: { u2: ["data:image/png;base64,CCC"] },
        })}
      />,
    );
    expect(screen.getByTestId("user-turn-images")).toBeInTheDocument();
    expect(
      screen.getByTestId("user-turn").querySelector(".chat-turn__content"),
    ).toBeNull();
  });

  it("renders no image strip for a text-only turn", () => {
    render(
      <ChatThread
        {...props({ turns: [{ id: "u3", role: "user", content: "hi" }] })}
      />,
    );
    expect(screen.queryByTestId("user-turn-images")).toBeNull();
  });
});

describe("ChatThread — answer-card follow-ups gated while streaming (U2)", () => {
  // A committed assistant turn with suggestion chips (the ungated U2 surface).
  const assistantTurn = {
    id: "a1",
    role: "assistant" as const,
    answer: RESOLUTION_FAILED_ANSWER,
  };
  const turns = [
    { id: "u1", role: "user" as const, content: "garcomp" },
    assistantTurn,
  ];

  it("disables committed answer-card follow-up chips while a new turn streams", () => {
    const onFollowUp = vi.fn();
    render(
      <ChatThread
        {...props({
          turns,
          status: "streaming",
          streamingMarkdown: "Working on it…",
          onFollowUp,
        })}
      />,
    );
    const chip = screen.getByTestId("suggestion-chip-0");
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    // A mid-stream chip click must NOT enqueue a follow-up (which would abort +
    // orphan the in-flight turn).
    expect(onFollowUp).not.toHaveBeenCalled();
  });

  it("keeps committed answer-card follow-up chips clickable when idle", () => {
    const onFollowUp = vi.fn();
    render(
      <ChatThread {...props({ turns, status: "idle", onFollowUp })} />,
    );
    const chip = screen.getByTestId("suggestion-chip-0");
    expect(chip).not.toBeDisabled();
    fireEvent.click(chip);
    expect(onFollowUp).toHaveBeenCalledWith("Garchomp");
  });
});

describe("ChatThread — streaming field-notes trail", () => {
  const twoTools = [
    { tool: "resolve_entity", label: "🔍 Resolving “garchom”…" },
    {
      tool: "get_pokemon",
      label: "📊 Fetching Garchomp…",
    },
  ];

  it("shows a Looking up sentence of friendly nouns, never raw tool ids", () => {
    render(
      <ChatThread {...props({ status: "streaming", activity: twoTools })} />,
    );
    const note = screen.getByTestId("field-note");
    expect(note).toHaveTextContent("Looking up Dex lookup, Pokémon");
    expect(note.textContent).not.toContain("resolve_entity");
    expect(note.textContent).not.toContain("get_pokemon");
    expect(screen.queryByTestId("progress-thinking")).toBeNull();
  });

  it("falls back to a generic 'Lookup' token for an unrecognized tool", () => {
    render(
      <ChatThread
        {...props({
          status: "streaming",
          activity: [{ tool: "some_future_tool", label: "Doing a thing…" }],
        })}
      />,
    );
    const note = screen.getByTestId("field-note");
    expect(note).toHaveTextContent("Looking up Lookup");
    expect(note.textContent).not.toContain("SOME_FUTURE_TOOL");
  });

  it("exposes instrumentToken with the full copy-table mapping", () => {
    expect(instrumentToken("run_sql")).toBe("Game data");
    expect(instrumentToken("search_wiki")).toBe("Wiki");
    expect(instrumentToken("get_meta_usage")).toBe("Usage");
    expect(instrumentToken("submit_builder_answer")).toBe("Teams");
    expect(instrumentToken("totally_unknown")).toBe("Lookup");
  });

  it("shows the answer skeleton while working, before prose streams", () => {
    render(
      <ChatThread {...props({ status: "streaming", activity: twoTools })} />,
    );
    expect(screen.getByTestId("answer-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("field-note")).toBeInTheDocument();
  });

  it("uses an unsigned red plate, not a type-wash, while thinking", () => {
    render(
      <ChatThread {...props({ status: "streaming", activity: twoTools })} />,
    );
    const skeleton = screen.getByTestId("answer-skeleton");
    expect(skeleton).toHaveAttribute("data-unsigned");
    expect(skeleton.getAttribute("data-plate")).toBeNull();
    expect(skeleton.className).not.toContain("chat-thread__skeleton--desk");
    expect(
      (skeleton as HTMLElement).style.getPropertyValue("--plate-a"),
    ).toBe("");
  });

  it("stays unsigned even when activity labels name a type", () => {
    render(
      <ChatThread
        {...props({
          status: "streaming",
          activity: [
            {
              tool: "get_type_matchups",
              label: "Type matchups for dragon",
            },
          ],
        })}
      />,
    );
    const skeleton = screen.getByTestId("answer-skeleton");
    expect(skeleton).toHaveAttribute("data-unsigned");
    expect(skeleton.getAttribute("data-plate")).toBeNull();
    expect(
      (skeleton as HTMLElement).style.getPropertyValue("--plate-a"),
    ).toBe("");
  });

  it("falls back to a generic thinking chip before the first tool runs", () => {
    render(<ChatThread {...props({ status: "streaming" })} />);
    expect(screen.getByTestId("progress-thinking")).toHaveTextContent(
      "Thinking through your question",
    );
    // Skeleton still holds the layout even before the first tool lands.
    expect(screen.getByTestId("answer-skeleton")).toBeInTheDocument();
  });

  it("hides the incoming plate once prose starts streaming", () => {
    render(
      <ChatThread
        {...props({
          status: "streaming",
          activity: twoTools,
          streamingMarkdown: "Only **Garchomp** qualifies.",
        })}
      />,
    );
    expect(screen.queryByTestId("field-note")).toBeNull();
    expect(screen.queryByTestId("answer-skeleton")).toBeNull();
    expect(screen.getByTestId("streaming-answer")).toBeInTheDocument();
  });
});
