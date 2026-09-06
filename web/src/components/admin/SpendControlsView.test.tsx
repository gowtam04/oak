import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import SpendControlsView, {
  type SpendControlsViewProps,
} from "./SpendControlsView";

// Fixtures — the GET /api/admin/settings `spend` projection. Components render
// fixtures only; no db/repos imported (admin component-test rule).
const ADDED_AT = Date.UTC(2026, 5, 1, 12, 0, 0);

const DENYLIST = [
  {
    email: "heavy@example.com",
    addedAt: ADDED_AT,
    addedBy: "owner@oak.test",
  },
  {
    email: "spam@example.com",
    addedAt: ADDED_AT + 60_000,
    addedBy: null,
  },
] as const;

function renderView(overrides: Partial<SpendControlsViewProps> = {}) {
  const props: SpendControlsViewProps = {
    signedCap: 25,
    guestCap: 10,
    denylist: [],
    onSaveCaps: vi.fn(),
    onAddEmail: vi.fn(),
    onRemoveEmail: vi.fn(),
    ...overrides,
  };
  render(<SpendControlsView {...props} />);
  return props;
}

describe("SpendControlsView", () => {
  it("renders the spend-controls root with launch-default cap fields", () => {
    renderView();
    expect(screen.getByTestId("spend-controls-view")).toBeInTheDocument();
    expect(
      (screen.getByTestId("spend-cap-signed") as HTMLInputElement).value,
    ).toBe("25");
    expect(
      (screen.getByTestId("spend-cap-guest") as HTMLInputElement).value,
    ).toBe("10");
    expect(screen.getByTestId("spend-caps-save")).toBeInTheDocument();
  });

  it("shows an empty denylist state, not a placeholder blocked user (SC-AC-3.2, SC-BR-12)", () => {
    renderView({ denylist: [] });
    expect(screen.getByTestId("spend-denylist-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("spend-denylist")).not.toBeInTheDocument();
    expect(
      screen.queryByText("jogyehyeong199@gmail.com"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("heavy@example.com")).not.toBeInTheDocument();
  });

  it("lists each denylisted email and when it was added (SC-AC-3.1)", () => {
    renderView({ denylist: [...DENYLIST] });
    expect(
      screen.queryByTestId("spend-denylist-empty"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("spend-denylist")).toBeInTheDocument();

    const heavy = screen.getByTestId("spend-denylist-row-heavy@example.com");
    expect(heavy).toHaveTextContent("heavy@example.com");
    const heavyAdded = screen.getByTestId(
      "spend-denylist-added-at-heavy@example.com",
    );
    expect(heavyAdded.textContent?.trim()).not.toBe("");

    const spam = screen.getByTestId("spend-denylist-row-spam@example.com");
    expect(spam).toHaveTextContent("spam@example.com");
    const spamAdded = screen.getByTestId(
      "spend-denylist-added-at-spam@example.com",
    );
    expect(spamAdded.textContent?.trim()).not.toBe("");
  });

  it("renders an add-email field and add button", () => {
    renderView();
    expect(screen.getByTestId("spend-add-email")).toBeInTheDocument();
    expect(screen.getByTestId("spend-add-submit")).toBeInTheDocument();
  });

  it("calls onAddEmail with the entered email (SC-US-1, SC-AC-1.1)", () => {
    const props = renderView();
    fireEvent.change(screen.getByTestId("spend-add-email"), {
      target: { value: "blocked@example.com" },
    });
    fireEvent.click(screen.getByTestId("spend-add-submit"));
    expect(props.onAddEmail).toHaveBeenCalledTimes(1);
    expect(props.onAddEmail).toHaveBeenCalledWith("blocked@example.com");
  });

  it("does not call onAddEmail when the email field is empty", () => {
    const props = renderView();
    fireEvent.click(screen.getByTestId("spend-add-submit"));
    expect(props.onAddEmail).not.toHaveBeenCalled();
  });

  it("calls onRemoveEmail for the row's email (SC-US-2, SC-AC-2.1)", () => {
    const props = renderView({ denylist: [...DENYLIST] });
    fireEvent.click(
      screen.getByTestId("spend-denylist-remove-heavy@example.com"),
    );
    expect(props.onRemoveEmail).toHaveBeenCalledTimes(1);
    expect(props.onRemoveEmail).toHaveBeenCalledWith("heavy@example.com");
  });

  it("calls onSaveCaps with the edited positive integers (SC-US-4, SC-AC-4.2)", () => {
    const props = renderView();
    fireEvent.change(screen.getByTestId("spend-cap-signed"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByTestId("spend-cap-guest"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("spend-caps-save"));
    expect(props.onSaveCaps).toHaveBeenCalledTimes(1);
    expect(props.onSaveCaps).toHaveBeenCalledWith({
      signedCap: 40,
      guestCap: 5,
    });
  });

  it("does not call onSaveCaps for 0 or a negative cap (SC-AC-4.3)", () => {
    const props = renderView();
    fireEvent.change(screen.getByTestId("spend-cap-signed"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("spend-caps-save"));
    expect(props.onSaveCaps).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("spend-cap-signed"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByTestId("spend-cap-guest"), {
      target: { value: "-3" },
    });
    fireEvent.click(screen.getByTestId("spend-caps-save"));
    expect(props.onSaveCaps).not.toHaveBeenCalled();
  });

  it("does not call onSaveCaps for a non-integer cap (SC-AC-4.3)", () => {
    const props = renderView();
    fireEvent.change(screen.getByTestId("spend-cap-signed"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByTestId("spend-caps-save"));
    expect(props.onSaveCaps).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("spend-cap-signed"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByTestId("spend-cap-guest"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByTestId("spend-caps-save"));
    expect(props.onSaveCaps).not.toHaveBeenCalled();
  });

  it("renders an error banner when an error is provided", () => {
    renderView({ error: "Failed to save spend controls." });
    expect(screen.getByTestId("spend-error")).toHaveTextContent(
      "Failed to save spend controls.",
    );
  });

  it("shows a load-failure banner instead of a fake empty denylist, with controls disabled", () => {
    renderView({
      error: "Failed to load settings.",
      loading: true,
      denylist: [],
    });
    expect(screen.getByTestId("spend-error")).toHaveTextContent(
      "Failed to load settings.",
    );
    expect(
      screen.queryByTestId("spend-denylist-empty"),
    ).not.toBeInTheDocument();
    expect(
      (screen.getByTestId("spend-caps-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-add-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-cap-signed") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-cap-guest") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-add-email") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("disables save, add, and remove while pending", () => {
    renderView({ denylist: [...DENYLIST], pending: true });
    expect(
      (screen.getByTestId("spend-caps-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-add-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByTestId(
          "spend-denylist-remove-heavy@example.com",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("disables save and add while loading", () => {
    renderView({ loading: true });
    expect(
      (screen.getByTestId("spend-caps-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("spend-add-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
