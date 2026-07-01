import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import AdminNav, { ADMIN_NAV_TABS, isTabActive } from "./AdminNav";

describe("isTabActive", () => {
  it("matches Overview (/admin) only on the exact index path", () => {
    expect(isTabActive("/admin", "/admin")).toBe(true);
    // Overview must NOT light up for child routes ("/admin" is their prefix)
    expect(isTabActive("/admin", "/admin/usage")).toBe(false);
    expect(isTabActive("/admin", "/admin/cost")).toBe(false);
  });

  it("matches a child tab on its own path and any descendant", () => {
    expect(isTabActive("/admin/usage", "/admin/usage")).toBe(true);
    // stays active on the drill-down (e.g. /admin/usage/[id])
    expect(isTabActive("/admin/usage", "/admin/usage/abc-123")).toBe(true);
  });

  it("does not match a sibling tab", () => {
    expect(isTabActive("/admin/usage", "/admin/cost")).toBe(false);
    // a longer path that merely shares a prefix string is not a descendant
    expect(isTabActive("/admin/usage", "/admin/usage-extra")).toBe(false);
  });
});

describe("AdminNav", () => {
  it("renders all seven tabs in the design order with their hrefs", () => {
    render(<AdminNav pathname="/admin" />);
    const expected = [
      ["Overview", "/admin"],
      ["Usage", "/admin/usage"],
      ["Cost", "/admin/cost"],
      ["Errors", "/admin/errors"],
      ["Accounts", "/admin/accounts"],
      ["Conversations", "/admin/conversations"],
      ["Teams", "/admin/teams"],
    ];
    // the constant the shell relies on stays the canonical 7-tab list
    expect(ADMIN_NAV_TABS).toHaveLength(7);

    for (const [label, href] of expected) {
      const tab = screen.getByTestId(`admin-nav-tab-${label.toLowerCase()}`);
      expect(tab).toHaveTextContent(label);
      expect(tab).toHaveAttribute("href", href);
    }
  });

  it("renders the tabs as anchors (no router dependency)", () => {
    render(<AdminNav pathname="/admin" />);
    const tab = screen.getByTestId("admin-nav-tab-overview");
    expect(tab.tagName).toBe("A");
  });

  it("marks the Overview tab active (and only it) on /admin", () => {
    render(<AdminNav pathname="/admin" />);
    expect(screen.getByTestId("admin-nav-tab-overview")).toHaveClass(
      "admin-nav__tab--active",
    );
    expect(screen.getByTestId("admin-nav-tab-overview")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("admin-nav-tab-usage")).not.toHaveClass(
      "admin-nav__tab--active",
    );
  });

  it("marks the matching child tab active on a drill-down path", () => {
    render(<AdminNav pathname="/admin/usage/turn-42" />);
    expect(screen.getByTestId("admin-nav-tab-usage")).toHaveClass(
      "admin-nav__tab--active",
    );
    // Overview is not active for a child route
    expect(screen.getByTestId("admin-nav-tab-overview")).not.toHaveClass(
      "admin-nav__tab--active",
    );
  });
});
