import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import LandingSection from "./LandingSection";
import { LANDING_DISCLAIMER, LANDING_FAQ } from "@/components/landing/landing-content";

describe("LandingSection", () => {
  it("renders every FAQ question", () => {
    render(<LandingSection />);
    for (const { q } of LANDING_FAQ) {
      expect(screen.getByText(q)).toBeInTheDocument();
    }
  });

  it("links the footer to the privacy page", () => {
    render(<LandingSection />);
    const link = screen.getByRole("link", { name: "Privacy" });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("renders the non-affiliation disclaimer", () => {
    render(<LandingSection />);
    expect(screen.getByText(LANDING_DISCLAIMER)).toBeInTheDocument();
  });

  it("emits FAQPage JSON-LD matching the FAQ data", () => {
    const { container } = render(<LandingSection />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script!.textContent ?? "");
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity).toHaveLength(LANDING_FAQ.length);
  });
});
