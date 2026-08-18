/**
 * P6 — conversation pin strip (PIN-US-1–3 UI).
 *
 * Distinct from chat `PinStrip` (pinned assistant cards). This strip lists
 * rich artifact snapshots on the open conversation.
 *
 * Requirement refs: PIN-US-1–3, PIN-AC-1.1, PIN-AC-1.4, PIN-AC-2.2,
 * PIN-AC-3.1–3.2, PIN-AC-3.4, PIN-BR-1, PIN-BR-3, PIN-BR-4, AUTH-BR-1.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import type { PinnedArtifactSummary } from "@/lib/api/artifact-pin-client";

import PinnedArtifactStrip from "./PinnedArtifactStrip";

afterEach(() => cleanup());

const PINS: PinnedArtifactSummary[] = [
  {
    id: "pin-1",
    kind: "calc",
    title: "Garchomp EQ vs Farigiraf",
    created_at: 1,
  },
  {
    id: "pin-2",
    kind: "comparison",
    title: "Garchomp vs Dragapult",
    created_at: 2,
  },
];

describe("PinnedArtifactStrip — visibility (PIN-US-1, AUTH-BR-1)", () => {
  it("renders nothing when the caller is a guest, even if pins are passed (PIN-AC-1.4, AUTH-BR-1)", () => {
    const { container } = render(
      <PinnedArtifactStrip
        signedIn={false}
        pins={PINS}
        onOpen={vi.fn()}
        onUnpin={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("pinned-artifact-strip")).toBeNull();
    expect(screen.queryByText(/pin/i)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when signed in with zero pins (PIN-AC-1.1 empty strip)", () => {
    const { container } = render(
      <PinnedArtifactStrip
        signedIn
        pins={[]}
        onOpen={vi.fn()}
        onUnpin={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("pinned-artifact-strip")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("lists snapshot titles when signed in with ≥1 pin (PIN-AC-1.1, PIN-AC-2.2)", () => {
    render(
      <PinnedArtifactStrip
        signedIn
        pins={PINS}
        onOpen={vi.fn()}
        onUnpin={vi.fn()}
      />,
    );
    const strip = screen.getByTestId("pinned-artifact-strip");
    expect(within(strip).getByText("Garchomp EQ vs Farigiraf")).toBeInTheDocument();
    expect(within(strip).getByText("Garchomp vs Dragapult")).toBeInTheDocument();
  });
});

describe("PinnedArtifactStrip — open + unpin (PIN-US-3)", () => {
  it("tapping a strip item opens that snapshot (PIN-AC-3.4)", () => {
    const onOpen = vi.fn();
    render(
      <PinnedArtifactStrip
        signedIn
        pins={PINS}
        onOpen={onOpen}
        onUnpin={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("pinned-artifact-strip-item-pin-2"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(PINS[1]);
  });

  it("unpin from the strip is immediate and needs no confirm (PIN-AC-3.2, PIN-BR-4)", () => {
    const onUnpin = vi.fn();
    render(
      <PinnedArtifactStrip
        signedIn
        pins={PINS}
        onOpen={vi.fn()}
        onUnpin={onUnpin}
      />,
    );
    fireEvent.click(screen.getByTestId("pinned-artifact-strip-unpin-pin-1"));
    expect(onUnpin).toHaveBeenCalledTimes(1);
    expect(onUnpin).toHaveBeenCalledWith("pin-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the cap explanation when a sixth Pin was refused (PIN-AC-3.1, PIN-BR-3)", () => {
    render(
      <PinnedArtifactStrip
        signedIn
        pins={PINS}
        capError
        onOpen={vi.fn()}
        onUnpin={vi.fn()}
      />,
    );
    const message = screen.getByTestId("pin-cap-message");
    expect(message).toHaveTextContent(/5|five/i);
    expect(message).toHaveTextContent(/unpin/i);
  });
});
