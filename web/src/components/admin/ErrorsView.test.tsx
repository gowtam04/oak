import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

afterEach(() => cleanup());

import ErrorsView, {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  usageHrefForCategory,
} from "./ErrorsView";
import type { ErrorsResponse, Range } from "@/lib/admin/admin-types";

// Component tests render fixtures only and never import db/repos (CLAUDE.md
// jsdom rule). This is a self-contained `GET /api/admin/errors` payload.
const RANGE: Range = { from: 1000, to: 2000, bucket: "day" };

const FIXTURE: ErrorsResponse = {
  range: RANGE,
  totalTurns: 100,
  categories: [
    { key: "resolution_failed", count: 5, ratePct: 5.0 },
    { key: "clarification_needed", count: 3, ratePct: 3.0 },
    { key: "insufficient_data", count: 2, ratePct: 2.0 },
    { key: "tool_error", count: 4, ratePct: 4.0 },
    { key: "otp_email_failed", count: 1, ratePct: 1.0 },
    { key: "rate_limited", count: 6, ratePct: 6.0 },
  ],
};

describe("usageHrefForCategory", () => {
  it("seeds the explorer status filter for status-keyed categories + carries the window", () => {
    expect(usageHrefForCategory("resolution_failed", RANGE)).toBe(
      "/admin/usage?status=resolution_failed&from=1000&to=2000",
    );
    expect(usageHrefForCategory("clarification_needed", RANGE)).toBe(
      "/admin/usage?status=clarification_needed&from=1000&to=2000",
    );
    expect(usageHrefForCategory("insufficient_data", RANGE)).toBe(
      "/admin/usage?status=insufficient_data&from=1000&to=2000",
    );
    expect(usageHrefForCategory("rate_limited", RANGE)).toBe(
      "/admin/usage?status=rate_limited&from=1000&to=2000",
    );
  });

  it("omits status for tool_error / otp_email_failed (no turn-status filter) but keeps the window", () => {
    expect(usageHrefForCategory("tool_error", RANGE)).toBe(
      "/admin/usage?from=1000&to=2000",
    );
    expect(usageHrefForCategory("otp_email_failed", RANGE)).toBe(
      "/admin/usage?from=1000&to=2000",
    );
  });
});

describe("ErrorsView", () => {
  it("renders a loading state before any data arrives", () => {
    render(<ErrorsView data={null} loading />);
    expect(screen.getByTestId("errors-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("errors-kpis")).not.toBeInTheDocument();
  });

  it("renders an error message in place of the data", () => {
    render(<ErrorsView data={null} error="Failed to load errors (500)" />);
    expect(screen.getByTestId("errors-error")).toHaveTextContent(
      "Failed to load errors (500)",
    );
    expect(screen.queryByTestId("errors-kpis")).not.toBeInTheDocument();
  });

  it("renders the headline KPIs (ADMIN-AC-4.1)", () => {
    render(<ErrorsView data={FIXTURE} />);
    const cards = within(screen.getByTestId("errors-kpis")).getAllByTestId(
      "kpi-card",
    );
    expect(cards).toHaveLength(3);

    const labels = within(screen.getByTestId("errors-kpis"))
      .getAllByTestId("kpi-card-label")
      .map((el) => el.textContent);
    expect(labels).toEqual([
      "Total turns",
      "Failed turns",
      "Rate-limit rejections",
    ]);

    const values = within(screen.getByTestId("errors-kpis"))
      .getAllByTestId("kpi-card-value")
      .map((el) => el.textContent);
    // total turns = 100; failed = 5+3+2 = 10; rate-limited = 6
    expect(values[0]).toContain("100");
    expect(values[1]).toContain("10");
    expect(values[2]).toContain("6");
  });

  it("tones the failed-turns KPI by its rate (10% → danger)", () => {
    render(<ErrorsView data={FIXTURE} />);
    const cards = within(screen.getByTestId("errors-kpis")).getAllByTestId(
      "kpi-card",
    );
    // second card is "Failed turns"; 10/100 = 10% → danger tone
    expect(cards[1]).toHaveClass("kpi-card--danger");
  });

  it("renders every taxonomy category in canonical order with its count and rate", () => {
    render(<ErrorsView data={FIXTURE} />);

    for (const key of CATEGORY_ORDER) {
      const link = screen.getByTestId(`errors-category-link-${key}`);
      expect(link).toHaveTextContent(CATEGORY_LABELS[key]);
    }

    expect(screen.getByTestId("errors-count-resolution_failed")).toHaveTextContent(
      "5",
    );
    expect(screen.getByTestId("errors-rate-resolution_failed")).toHaveTextContent(
      "5.0%",
    );
    expect(screen.getByTestId("errors-count-rate_limited")).toHaveTextContent("6");
    expect(screen.getByTestId("errors-rate-otp_email_failed")).toHaveTextContent(
      "1.0%",
    );
  });

  it("links each category to the Usage explorer with the right filter (ADMIN-AC-4.2)", () => {
    render(<ErrorsView data={FIXTURE} />);

    expect(
      screen.getByTestId("errors-category-link-resolution_failed"),
    ).toHaveAttribute(
      "href",
      "/admin/usage?status=resolution_failed&from=1000&to=2000",
    );
    expect(screen.getByTestId("errors-category-link-rate_limited")).toHaveAttribute(
      "href",
      "/admin/usage?status=rate_limited&from=1000&to=2000",
    );
    // non-status categories drop `status` but keep the window
    expect(screen.getByTestId("errors-category-link-tool_error")).toHaveAttribute(
      "href",
      "/admin/usage?from=1000&to=2000",
    );
    expect(
      screen.getByTestId("errors-category-link-otp_email_failed"),
    ).toHaveAttribute("href", "/admin/usage?from=1000&to=2000");
  });

  it("renders a zero row for a category the response omitted (still shown)", () => {
    const partial: ErrorsResponse = {
      range: RANGE,
      totalTurns: 50,
      categories: [{ key: "resolution_failed", count: 2, ratePct: 4.0 }],
    };
    render(<ErrorsView data={partial} />);

    // every category still has a row...
    for (const key of CATEGORY_ORDER) {
      expect(
        screen.getByTestId(`errors-category-link-${key}`),
      ).toBeInTheDocument();
    }
    // ...and the omitted ones read zero
    expect(screen.getByTestId("errors-count-tool_error")).toHaveTextContent("0");
    expect(screen.getByTestId("errors-rate-tool_error")).toHaveTextContent("0.0%");
  });

  it("notes the zero-turns case so the all-0% rates read correctly (ADMIN-BR-8)", () => {
    const empty: ErrorsResponse = {
      range: RANGE,
      totalTurns: 0,
      categories: [],
    };
    render(<ErrorsView data={empty} />);
    expect(screen.getByTestId("errors-no-turns")).toBeInTheDocument();
    // failed KPI stays at 0 / default tone when there are no turns
    const cards = within(screen.getByTestId("errors-kpis")).getAllByTestId(
      "kpi-card",
    );
    expect(cards[1]).not.toHaveClass("kpi-card--danger");
    expect(cards[1]).not.toHaveClass("kpi-card--warn");
  });
});
