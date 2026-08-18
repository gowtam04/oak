import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import AppNav from "./AppNav";
import { PRIMARY_NAV_ITEMS, REFERENCE_NAV_ITEMS, isNavActive } from "./nav-items";

describe("isNavActive", () => {
  it("matches / only on the exact root path", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/teams")).toBe(false);
  });

  it("matches a destination on its own path and any descendant", () => {
    expect(isNavActive("/teams", "/teams")).toBe(true);
    expect(isNavActive("/teams", "/teams/x")).toBe(true);
  });

  it("does not match an unrelated destination", () => {
    expect(isNavActive("/pokedex", "/")).toBe(false);
  });
});

describe("AppNav — New chat control", () => {
  it("renders as a button and fires onNewChat when the prop is given", () => {
    const onNewChat = vi.fn();
    render(<AppNav pathname="/" onNewChat={onNewChat} />);
    const control = screen.getByTestId("new-chat");
    expect(control.tagName).toBe("BUTTON");
    fireEvent.click(control);
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("renders as a link to / when onNewChat is absent", () => {
    render(<AppNav pathname="/teams" />);
    const control = screen.getByTestId("new-chat");
    expect(control.tagName).toBe("A");
    expect(control).toHaveAttribute("href", "/");
  });
});

describe("AppNav — primary items", () => {
  it("renders every primary item with its href", () => {
    render(<AppNav pathname="/" />);
    for (const item of PRIMARY_NAV_ITEMS) {
      const link = screen.getByTestId(`app-nav-${item.label.toLowerCase()}`);
      expect(link).toHaveTextContent(item.label);
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("marks Teams active (and only it) on /teams", () => {
    render(<AppNav pathname="/teams" />);
    const teams = screen.getByTestId("app-nav-teams");
    expect(teams).toHaveClass("app-nav__link--active");
    expect(teams).toHaveAttribute("aria-current", "page");
  });

  it("does not mark Teams active on /", () => {
    render(<AppNav pathname="/" />);
    const teams = screen.getByTestId("app-nav-teams");
    expect(teams).not.toHaveClass("app-nav__link--active");
    expect(teams).not.toHaveAttribute("aria-current");
  });
});

describe("AppNav — reference footer", () => {
  it("links to all four reference sections and Privacy", () => {
    render(<AppNav pathname="/" />);
    for (const item of REFERENCE_NAV_ITEMS) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});

describe("AppNav — landmarks", () => {
  it("exposes Primary and Reference nav landmarks", () => {
    render(<AppNav pathname="/" />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Reference" })).toBeInTheDocument();
  });
});

describe("AppNav — Calculator destination (CALC-US-1, CALC-AC-1.1–1.2)", () => {
  it("lists Calculator as a first-class primary destination at /calc", () => {
    const calc = PRIMARY_NAV_ITEMS.find(
      (item) => item.href === "/calc" || /calculator/i.test(item.label),
    );
    expect(calc).toBeDefined();
    expect(calc!.href).toBe("/calc");
    expect(calc!.label).toMatch(/calculator/i);

    render(<AppNav pathname="/calc" />);
    const link = screen.getByTestId("app-nav-calculator");
    expect(link).toHaveAttribute("href", "/calc");
    expect(link).toHaveClass("app-nav__link--active");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});

describe("AppNav — slot", () => {
  it("renders children in the slot when given", () => {
    render(
      <AppNav pathname="/">
        <div data-testid="slot-content">history</div>
      </AppNav>,
    );
    expect(screen.getByTestId("slot-content")).toBeInTheDocument();
  });

  it("renders no slot element when children are omitted", () => {
    const { container } = render(<AppNav pathname="/teams" />);
    expect(container.querySelector(".app-nav__slot")).toBeNull();
  });
});
