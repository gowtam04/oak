/**
 * SharedByMe — Account list of live share links + revoke (SHARE-US-4, ADR-11).
 *
 * Expected props:
 *   shares: { id, url, conversationTitle, createdAt }[]
 *   onRevoke: (id: string) => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());

import SharedByMe from "./SharedByMe";
import type { ShareListItem } from "@/lib/api/share-client";

const SHARES: ShareListItem[] = [
  {
    id: "share-1",
    url: "https://oak.example/a/share-1",
    conversationTitle: "What beats Garchomp?",
    createdAt: 1_700_000_000_000,
  },
  {
    id: "share-2",
    url: "https://oak.example/a/share-2",
    conversationTitle: "Rain vs sun",
    createdAt: 1_700_000_100_000,
  },
];

describe("SharedByMe (SHARE-US-4)", () => {
  it("lists live links with enough to recognize them and a Revoke action (SHARE-AC-4.1)", () => {
    const onRevoke = vi.fn();
    render(<SharedByMe shares={SHARES} onRevoke={onRevoke} />);

    const list = screen.getByTestId("shared-by-me");
    expect(within(list).getByText("What beats Garchomp?")).toBeInTheDocument();
    expect(within(list).getByText("Rain vs sun")).toBeInTheDocument();
    expect(screen.queryByTestId("shared-by-me-empty")).toBeNull();

    const first = screen.getByTestId("shared-by-me-item-share-1");
    expect(within(first).getByText(/\/a\/share-1/)).toBeInTheDocument();
    fireEvent.click(within(first).getByRole("button", { name: /^revoke$/i }));
    expect(onRevoke).toHaveBeenCalledWith("share-1");
  });

  it("shows an empty state, not an error, when there are no live shares (SHARE-AC-4.2)", () => {
    render(<SharedByMe shares={[]} onRevoke={vi.fn()} />);
    expect(screen.getByTestId("shared-by-me-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("shared-by-me-item-share-1")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops a revoked row when the parent refreshes the list (SHARE-AC-4.3)", () => {
    const { rerender } = render(
      <SharedByMe shares={SHARES} onRevoke={vi.fn()} />,
    );
    expect(screen.getByText("What beats Garchomp?")).toBeInTheDocument();
    rerender(<SharedByMe shares={SHARES.slice(1)} onRevoke={vi.fn()} />);
    expect(screen.queryByText("What beats Garchomp?")).toBeNull();
    expect(screen.getByText("Rain vs sun")).toBeInTheDocument();
  });
});
