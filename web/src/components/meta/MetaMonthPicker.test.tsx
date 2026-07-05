import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// MetaMonthPicker only calls useRouter().push — stub it so the component
// renders deterministically under jsdom with no router context required.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

import MetaMonthPicker, { formatMonthLabel } from "./MetaMonthPicker";

describe("formatMonthLabel", () => {
  it("formats a YYYY-MM string as 'Month Year'", () => {
    expect(formatMonthLabel("2026-05")).toBe("May 2026");
  });

  it("passes through an unparseable value unchanged", () => {
    expect(formatMonthLabel("not-a-month")).toBe("not-a-month");
  });
});

describe("MetaMonthPicker", () => {
  it("renders a month option per entry with formatted labels", () => {
    render(
      <MetaMonthPicker
        months={["2026-04", "2026-05"]}
        current="2026-05"
        basePath="/meta/gen9ou"
      />,
    );
    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(screen.getByText("May 2026")).toBeInTheDocument();
  });

  it("selects the current month", () => {
    render(
      <MetaMonthPicker
        months={["2026-04", "2026-05"]}
        current="2026-05"
        basePath="/meta/gen9ou"
      />,
    );
    expect(screen.getByTestId("meta-month-select")).toHaveValue("2026-05");
  });

  it("pushes the base path with the picked month on change", () => {
    render(
      <MetaMonthPicker
        months={["2026-04", "2026-05"]}
        current="2026-05"
        basePath="/meta/gen9ou"
      />,
    );
    fireEvent.change(screen.getByTestId("meta-month-select"), {
      target: { value: "2026-04" },
    });
    expect(pushMock).toHaveBeenCalledWith("/meta/gen9ou?month=2026-04");
  });

  it("renders nothing for an empty month list", () => {
    const { container } = render(
      <MetaMonthPicker months={[]} current="2026-05" basePath="/meta/gen9ou" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
