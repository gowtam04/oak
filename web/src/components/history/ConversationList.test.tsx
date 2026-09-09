import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

afterEach(() => cleanup());
import ConversationList from "./ConversationList";
import type { ConversationSummary } from "@/lib/api/history-client";

function summary(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "c",
    title: "t",
    format: "scarlet-violet",
    pinned: false,
    updatedAt: Date.now(),
    ...over,
  };
}

function setup(
  conversations: ConversationSummary[],
  props: Partial<Parameters<typeof ConversationList>[0]> = {},
) {
  const handlers = {
    onQueryChange: vi.fn(),
    onNewChat: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onPin: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ConversationList
      conversations={conversations}
      activeId={null}
      query=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("ConversationList", () => {
  it("renders no New-chat button of its own (AppNav owns that affordance)", () => {
    setup([]);
    expect(screen.queryByTestId("new-chat")).toBeNull();
  });

  it("forwards search input to onQueryChange", () => {
    const h = setup([]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), {
      target: { value: "garchomp" },
    });
    expect(h.onQueryChange).toHaveBeenCalledWith("garchomp");
  });

  it("shows the empty state with a start-your-first-chat CTA when there are no conversations and no filter", () => {
    setup([]);
    expect(screen.getByTestId("history-empty")).toHaveTextContent(
      "No conversations yet",
    );
    expect(screen.getByTestId("history-empty-cta")).toBeInTheDocument();
  });

  it("the empty-state CTA starts a new chat", () => {
    const h = setup([]);
    fireEvent.click(screen.getByTestId("history-empty-cta"));
    expect(h.onNewChat).toHaveBeenCalled();
  });

  it("shows a no-results state (no CTA) when a search matches nothing", () => {
    setup([], { query: "zzz" });
    expect(screen.getByTestId("history-empty")).toHaveTextContent(
      "No conversations match",
    );
    // The CTA is only for the true-empty case, not a filtered no-match.
    expect(screen.queryByTestId("history-empty-cta")).toBeNull();
  });

  it("groups pinned above recent with headings", () => {
    setup([
      summary({ id: "p", title: "Pinned one", pinned: true }),
      summary({ id: "r", title: "Recent one", pinned: false }),
    ]);
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Pinned one")).toBeInTheDocument();
    expect(screen.getByText("Recent one")).toBeInTheDocument();
  });

  it("renders a format badge per row and highlights the active row", () => {
    setup(
      [
        summary({ id: "a", title: "Alpha", format: "champions" }),
        summary({ id: "b", title: "Beta" }),
      ],
      { activeId: "b" },
    );
    expect(screen.getAllByTestId("format-badge")).toHaveLength(2);
    const rows = screen.getAllByTestId("conversation-row");
    const active = rows.find((r) => r.hasAttribute("data-active"));
    expect(active && within(active).getByText("Beta")).toBeTruthy();
  });

  it("delegates row open with the conversation id", () => {
    const h = setup([summary({ id: "abc", title: "Openable" })]);
    fireEvent.click(screen.getByTitle("Openable"));
    expect(h.onOpen).toHaveBeenCalledWith("abc");
  });
});

describe("ConversationList — folders / archive / bulk (ORG-US-1..3)", () => {
  function setupQol(
    conversations: ConversationSummary[],
    extra: Record<string, unknown> = {},
  ) {
    const handlers = {
      onQueryChange: vi.fn(),
      onNewChat: vi.fn(),
      onOpen: vi.fn(),
      onRename: vi.fn(),
      onPin: vi.fn(),
      onDelete: vi.fn(),
      onFolderChange: vi.fn(),
      onArchivedOnlyChange: vi.fn(),
      onIncludeArchivedChange: vi.fn(),
      onToggleSelect: vi.fn(),
      onBulk: vi.fn(),
    };
    render(
      <ConversationList
        {...({
          conversations,
          activeId: null,
          query: "",
          ...handlers,
          ...extra,
        } as Parameters<typeof ConversationList>[0])}
      />,
    );
    return handlers;
  }

  it("lists folder views plus Unfiled and Archive (ORG-AC-1.1, ORG-AC-2.1)", () => {
    setupQol([], {
      folders: [{ id: "f-vgc", name: "VGC", createdAt: 1 }],
    });
    expect(screen.getByRole("button", { name: /^unfiled$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^archive$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VGC" })).toBeInTheDocument();
  });

  it("filters to a folder when that view is chosen (ORG-AC-1.3)", () => {
    const h = setupQol([summary({ id: "c1", title: "Ladder" })], {
      folders: [{ id: "f-vgc", name: "VGC", createdAt: 1 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "VGC" }));
    expect(h.onFolderChange).toHaveBeenCalledWith("f-vgc");
  });

  it("offers an include-archived opt-in on search (ORG-AC-2.4)", () => {
    const h = setupQol([], { query: "garchomp" });
    fireEvent.click(screen.getByRole("checkbox", { name: /include archived/i }));
    expect(h.onIncludeArchivedChange).toHaveBeenCalledWith(true);
  });

  it("confirms once before bulk delete (ORG-AC-3.1, ORG-AC-3.4)", () => {
    const h = setupQol(
      [
        summary({ id: "a", title: "Alpha" }),
        summary({ id: "b", title: "Beta" }),
      ],
      { selectedIds: ["a", "b"] },
    );
    fireEvent.click(screen.getByRole("button", { name: /bulk delete|delete selected/i }));
    expect(h.onBulk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(h.onBulk).toHaveBeenCalledWith("delete");
  });

  it("restores the default non-archived list from All (ORG-BR-3)", () => {
    const h = setupQol([], {
      folders: [{ id: "f-vgc", name: "VGC", createdAt: 1 }],
      folderId: "f-vgc",
    });
    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    expect(h.onFolderChange).toHaveBeenCalledWith(null);
    expect(h.onArchivedOnlyChange).toHaveBeenCalledWith(false);
  });

  it("creates a folder from the new-folder field (ORG-AC-1.1)", () => {
    const onCreateFolder = vi.fn();
    setupQol([], {
      folders: [],
      onCreateFolder,
    });
    fireEvent.change(screen.getByRole("textbox", { name: /new folder name/i }), {
      target: { value: "VGC" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create folder/i }));
    expect(onCreateFolder).toHaveBeenCalledWith("VGC");
  });

  it("bulk-unarchives from Archive without a confirm (ORG-AC-3.2)", () => {
    const h = setupQol(
      [summary({ id: "a", title: "Alpha", archived: true })],
      { selectedIds: ["a"], archivedOnly: true },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /unarchive selected/i }),
    );
    expect(h.onBulk).toHaveBeenCalledWith("unarchive");
  });

  it("bulk-moves into a folder without a confirm (ORG-AC-3.3)", () => {
    const h = setupQol(
      [summary({ id: "a", title: "Alpha" })],
      {
        selectedIds: ["a"],
        folders: [{ id: "f-vgc", name: "VGC", createdAt: 1 }],
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /move selected/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "VGC" }));
    expect(h.onBulk).toHaveBeenCalledWith("move", "f-vgc");
  });

  it("offers Markdown and PDF export for the open conversation (EXP-US-1/2)", () => {
    const onExport = vi.fn();
    setupQol([summary({ id: "a", title: "Alpha" })], {
      activeId: "a",
      onExport,
    });
    fireEvent.click(screen.getByRole("button", { name: /export markdown/i }));
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    expect(onExport).toHaveBeenNthCalledWith(1, "md");
    expect(onExport).toHaveBeenNthCalledWith(2, "pdf");
  });
});
