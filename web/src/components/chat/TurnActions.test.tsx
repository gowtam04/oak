/**
 * TurnActions — last-turn recovery + signed-in organize on a card
 * (REC-US-1/2, PIN-US-1, FORK-US-1; guests hide pin/fork).
 *
 * Expected props (page / ChatThread wiring):
 *   role: "user" | "assistant"
 *   isLast: boolean
 *   signedIn?: boolean
 *   streaming?: boolean
 *   pinned?: boolean
 *   onRetry?: () => void
 *   onEdit?: () => void
 *   onPin?: () => void
 *   onUnpin?: () => void
 *   onFork?: () => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import TurnActions from "./TurnActions";

type Role = "user" | "assistant";

function renderActions(
  over: {
    role?: Role;
    isLast?: boolean;
    signedIn?: boolean;
    streaming?: boolean;
    pinned?: boolean;
    onRetry?: () => void;
    onEdit?: () => void;
    onPin?: () => void;
    onUnpin?: () => void;
    onFork?: () => void;
  } = {},
) {
  const handlers = {
    onRetry: vi.fn(),
    onEdit: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onFork: vi.fn(),
  };
  render(
    <TurnActions
      role="assistant"
      isLast
      signedIn
      streaming={false}
      pinned={false}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe("TurnActions — Retry (REC-US-1, REC-BR-1)", () => {
  it("offers Retry on the last assistant card when nothing is in flight (REC-AC-1.7)", () => {
    const h = renderActions({ role: "assistant", isLast: true, streaming: false });
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(h.onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides Retry while a turn is in flight (REC-AC-1.7)", () => {
    renderActions({ role: "assistant", isLast: true, streaming: true });
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("does not offer Retry on an older assistant card (REC-BR-1)", () => {
    renderActions({ role: "assistant", isLast: false });
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("does not offer Retry on a user bubble", () => {
    renderActions({ role: "user", isLast: true });
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("still offers Retry to guests (REC-BR-8)", () => {
    renderActions({ signedIn: false, role: "assistant", isLast: true });
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
  });
});

describe("TurnActions — Edit (REC-US-2, REC-BR-1)", () => {
  it("offers Edit on the last user message (REC-AC-2.1)", () => {
    const h = renderActions({ role: "user", isLast: true });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(h.onEdit).toHaveBeenCalledTimes(1);
  });

  it("does not offer Edit on an older user message (REC-AC-2.7)", () => {
    renderActions({ role: "user", isLast: false });
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("does not offer Edit on an assistant card", () => {
    renderActions({ role: "assistant", isLast: true });
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("keeps Edit on the last user message while a turn streams (REC-AC-2.2)", () => {
    renderActions({ role: "user", isLast: true, streaming: true });
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });
});

describe("TurnActions — Pin / Fork signed-in only (PIN-US-1, FORK-US-1)", () => {
  it("offers Pin and Fork on a signed-in assistant card (PIN-AC-1.1, FORK-AC-1.1)", () => {
    const h = renderActions({
      role: "assistant",
      isLast: false,
      signedIn: true,
      pinned: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /^pin( turn)?$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^fork$/i }));
    expect(h.onPin).toHaveBeenCalledTimes(1);
    expect(h.onFork).toHaveBeenCalledTimes(1);
  });

  it("offers Unpin when the assistant card is already pinned (PIN-AC-1.3)", () => {
    const h = renderActions({
      role: "assistant",
      signedIn: true,
      pinned: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /^unpin( turn)?$/i }));
    expect(h.onUnpin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^pin( turn)?$/i })).toBeNull();
  });

  it("hides Pin and Fork for guests (PIN-AC-1.5, FORK-AC-1.5)", () => {
    renderActions({ role: "assistant", signedIn: false });
    expect(screen.queryByRole("button", { name: /^pin( turn)?$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^unpin( turn)?$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^fork$/i })).toBeNull();
  });

  it("does not offer Pin or Fork on a user bubble (PIN-BR-1)", () => {
    renderActions({ role: "user", isLast: true, signedIn: true });
    expect(screen.queryByRole("button", { name: /^pin( turn)?$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^fork$/i })).toBeNull();
  });
});
