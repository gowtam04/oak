import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import ConversationRow from "./ConversationRow";
import type { ConversationSummary } from "@/lib/api/history-client";

function summary(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    title: "What beats Garchomp?",
    format: "scarlet-violet",
    pinned: false,
    updatedAt: Date.now(),
    ...over,
  };
}

function setup(over: Partial<ConversationSummary> = {}, props: Partial<Parameters<typeof ConversationRow>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onPin: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ConversationRow conversation={summary(over)} active={false} {...handlers} {...props} />,
  );
  return handlers;
}

describe("ConversationRow", () => {
  it("renders title, format badge, and relative time", () => {
    setup();
    expect(screen.getByText("What beats Garchomp?")).toBeInTheDocument();
    expect(screen.getByTestId("format-badge")).toHaveTextContent("Gen 9");
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows the Champions badge for champions conversations", () => {
    setup({ format: "champions" });
    expect(screen.getByTestId("format-badge")).toHaveTextContent("Champions");
  });

  it("shows the Gen 7 badge for a gen-7 conversation", () => {
    setup({ format: "gen-7" });
    expect(screen.getByTestId("format-badge")).toHaveTextContent("Gen 7");
  });

  it("opens on title click", () => {
    const h = setup();
    fireEvent.click(screen.getByTitle("What beats Garchomp?"));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it("marks the open row without an OPEN stamp", () => {
    setup({}, { active: false });
    expect(screen.getByTestId("conversation-row")).not.toHaveAttribute(
      "data-active",
    );
    cleanup();
    setup({}, { active: true });
    expect(screen.getByTestId("conversation-row")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByTestId("conv-row-open")).toBeNull();
  });


  it("pins an unpinned conversation", () => {
    const h = setup({ pinned: false });
    fireEvent.click(screen.getByRole("button", { name: "Pin conversation" }));
    expect(h.onPin).toHaveBeenCalledWith(true);
  });

  it("unpins a pinned conversation", () => {
    const h = setup({ pinned: true });
    fireEvent.click(screen.getByRole("button", { name: "Unpin conversation" }));
    expect(h.onPin).toHaveBeenCalledWith(false);
  });

  it("renames inline on Enter", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
    const input = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(input, { target: { value: "New name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("New name");
  });

  it("cancels rename on Escape (no callback, reverts)", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
    const input = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(input, { target: { value: "Nope" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("What beats Garchomp?")).toBeInTheDocument();
  });

  it("requires a confirm step before deleting (AC-8.1)", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
    // Not deleted until confirmed.
    expect(h.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(h.onDelete).toHaveBeenCalledTimes(1);
  });

  it("can cancel the delete confirm", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(h.onDelete).not.toHaveBeenCalled();
    // Back to the normal actions.
    expect(screen.getByRole("button", { name: "Delete conversation" })).toBeInTheDocument();
  });

  it("marks the active row", () => {
    const h = {
      onOpen: vi.fn(),
      onRename: vi.fn(),
      onPin: vi.fn(),
      onDelete: vi.fn(),
    };
    render(<ConversationRow conversation={summary()} active {...h} />);
    expect(screen.getByTestId("conversation-row")).toHaveAttribute("data-active");
  });

  it("always shows the scope badge", () => {
    setup({ format: "champions" });
    expect(screen.getByTestId("format-badge")).toHaveTextContent("Champions");
  });
});

describe("ConversationRow — archive / folder / select (ORG-US-1..3)", () => {
  function setupQol(
    over: Partial<ConversationSummary> = {},
    extra: Record<string, unknown> = {},
  ) {
    const handlers = {
      onOpen: vi.fn(),
      onRename: vi.fn(),
      onPin: vi.fn(),
      onDelete: vi.fn(),
      onArchive: vi.fn(),
      onMoveToFolder: vi.fn(),
      onToggleSelect: vi.fn(),
    };
    render(
      <ConversationRow
        {...({
          conversation: summary(over),
          active: false,
          ...handlers,
          ...extra,
        } as Parameters<typeof ConversationRow>[0])}
      />,
    );
    return handlers;
  }

  it("archives a live conversation without a destructive confirm (ORG-AC-2.1)", () => {
    const h = setupQol({ archived: false });
    fireEvent.click(screen.getByRole("button", { name: /archive conversation/i }));
    expect(h.onArchive).toHaveBeenCalledWith(true);
  });

  it("unarchives from the Archive view (ORG-AC-2.2)", () => {
    const h = setupQol({ archived: true });
    fireEvent.click(screen.getByRole("button", { name: /unarchive conversation/i }));
    expect(h.onArchive).toHaveBeenCalledWith(false);
  });

  it("moves the row into a folder (ORG-AC-1.2)", () => {
    const h = setupQol(
      { folderId: null },
      { folders: [{ id: "f-vgc", name: "VGC", createdAt: 1 }] },
    );
    fireEvent.click(screen.getByRole("button", { name: /move to folder|file in folder/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "VGC" }));
    expect(h.onMoveToFolder).toHaveBeenCalledWith("f-vgc");
  });

  it("toggles multi-select for bulk actions (ORG-AC-3.1)", () => {
    const h = setupQol();
    fireEvent.click(screen.getByRole("checkbox", { name: /select conversation/i }));
    expect(h.onToggleSelect).toHaveBeenCalledTimes(1);
  });
});
