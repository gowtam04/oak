import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// usePathname is the only App-Router hook AdminShell touches; stub it so the
// shell renders deterministically under jsdom (no router context required).
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/usage",
}));

afterEach(() => cleanup());

import AdminShell, { useAdminRange } from "./AdminShell";
import type { Range } from "@/lib/admin/admin-types";

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 5, 15).getTime();
const SEED: Range = { from: NOW - 7 * DAY_MS, to: NOW, bucket: "day" };

/** A tiny consumer that surfaces the context range so tests can assert on it. */
function RangeProbe() {
  const { range, setRange } = useAdminRange();
  return (
    <div>
      <span data-testid="probe-from">{range.from}</span>
      <span data-testid="probe-to">{range.to}</span>
      <span data-testid="probe-bucket">{range.bucket}</span>
      <button
        type="button"
        data-testid="probe-set"
        onClick={() => setRange({ from: 100, to: 200, bucket: "hour" })}
      >
        set
      </button>
    </div>
  );
}

describe("AdminShell", () => {
  it("renders the brand, nav, date picker, and its children", () => {
    render(
      <AdminShell initialRange={SEED}>
        <p data-testid="page-content">hello</p>
      </AdminShell>,
    );
    expect(screen.getByTestId("admin-shell")).toBeInTheDocument();
    expect(screen.getByTestId("admin-brand")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav")).toBeInTheDocument();
    expect(screen.getByTestId("date-range-picker")).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toHaveTextContent("hello");
  });

  it("highlights the active nav tab from the resolved pathname", () => {
    // usePathname is mocked to "/admin/usage"
    render(<AdminShell initialRange={SEED}>x</AdminShell>);
    expect(screen.getByTestId("admin-nav-tab-usage")).toHaveClass(
      "admin-nav__tab--active",
    );
    expect(screen.getByTestId("admin-nav-tab-overview")).not.toHaveClass(
      "admin-nav__tab--active",
    );
  });

  it("provides the seeded range to consumers via useAdminRange", () => {
    render(
      <AdminShell initialRange={SEED}>
        <RangeProbe />
      </AdminShell>,
    );
    expect(screen.getByTestId("probe-from")).toHaveTextContent(String(SEED.from));
    expect(screen.getByTestId("probe-to")).toHaveTextContent(String(SEED.to));
    expect(screen.getByTestId("probe-bucket")).toHaveTextContent("day");
  });

  it("propagates a date-picker change to the shared range (single source of truth)", () => {
    render(
      <AdminShell initialRange={SEED}>
        <RangeProbe />
      </AdminShell>,
    );
    // flipping the bucket select flows through onChange → setRange → context
    fireEvent.change(screen.getByTestId("date-range-bucket"), {
      target: { value: "hour" },
    });
    expect(screen.getByTestId("probe-bucket")).toHaveTextContent("hour");
    // from/to are preserved by the controlled picker
    expect(screen.getByTestId("probe-from")).toHaveTextContent(String(SEED.from));
  });

  it("lets a consumer update the range and re-renders with the new window", () => {
    render(
      <AdminShell initialRange={SEED}>
        <RangeProbe />
      </AdminShell>,
    );
    fireEvent.click(screen.getByTestId("probe-set"));
    expect(screen.getByTestId("probe-from")).toHaveTextContent("100");
    expect(screen.getByTestId("probe-to")).toHaveTextContent("200");
    expect(screen.getByTestId("probe-bucket")).toHaveTextContent("hour");
  });
});

describe("useAdminRange (outside a provider)", () => {
  it("throws to flag a screen rendered outside <AdminShell>", () => {
    // Silence the expected React error-boundary console noise for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<RangeProbe />)).toThrow(
      /useAdminRange must be used within <AdminShell>/,
    );
    spy.mockRestore();
  });
});
