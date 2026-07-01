import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("renders the label and a string value", () => {
    render(<KpiCard label="Total turns" value="1,284" />);
    expect(screen.getByTestId("kpi-card")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-card-label")).toHaveTextContent(
      "Total turns",
    );
    expect(screen.getByTestId("kpi-card-value")).toHaveTextContent("1,284");
  });

  it("renders a numeric value", () => {
    render(<KpiCard label="Signups" value={42} />);
    expect(screen.getByTestId("kpi-card-value")).toHaveTextContent("42");
  });

  it("omits the hint line when no hint is provided", () => {
    render(<KpiCard label="Active users" value={12} />);
    expect(screen.queryByTestId("kpi-card-hint")).not.toBeInTheDocument();
  });

  it("renders the hint line when provided", () => {
    render(
      <KpiCard label="Active users" value={12} hint="9 signed-in · 3 guest" />,
    );
    expect(screen.getByTestId("kpi-card-hint")).toHaveTextContent(
      "9 signed-in · 3 guest",
    );
  });

  it("omits the hint line for an empty-string hint", () => {
    render(<KpiCard label="Active users" value={12} hint="" />);
    expect(screen.queryByTestId("kpi-card-hint")).not.toBeInTheDocument();
  });

  it("renders no estimated badge by default", () => {
    render(<KpiCard label="Total turns" value={100} />);
    expect(screen.queryByTestId("kpi-card-estimated")).not.toBeInTheDocument();
  });

  it("renders the estimated badge when estimated is true (ADMIN-BR-5)", () => {
    render(<KpiCard label="Estimated cost" value="$3.41" estimated />);
    expect(screen.getByTestId("kpi-card-estimated")).toBeInTheDocument();
    // the figure and its estimate marker live in the same value cell
    expect(screen.getByTestId("kpi-card-value")).toHaveTextContent("$3.41");
    expect(screen.getByTestId("kpi-card-value")).toHaveTextContent("est.");
  });

  it("applies no tone modifier class by default", () => {
    render(<KpiCard label="Total turns" value={100} />);
    const card = screen.getByTestId("kpi-card");
    expect(card).toHaveClass("kpi-card");
    expect(card.className).not.toMatch(/kpi-card--/);
  });

  it("applies the warn tone modifier class", () => {
    render(<KpiCard label="Error rate" value="4.2%" tone="warn" />);
    expect(screen.getByTestId("kpi-card")).toHaveClass("kpi-card--warn");
  });

  it("applies the danger tone modifier class", () => {
    render(<KpiCard label="Error rate" value="18.0%" tone="danger" />);
    expect(screen.getByTestId("kpi-card")).toHaveClass("kpi-card--danger");
  });
});
