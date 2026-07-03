import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import ReferenceFooter from "./ReferenceFooter";
import { LANDING_DISCLAIMER } from "@/components/landing/landing-content";

describe("ReferenceFooter", () => {
  it("renders the non-affiliation disclaimer verbatim", () => {
    render(<ReferenceFooter />);
    expect(screen.getByText(LANDING_DISCLAIMER)).toBeInTheDocument();
  });

  it("links to the privacy page", () => {
    render(<ReferenceFooter />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("links home", () => {
    render(<ReferenceFooter />);
    expect(screen.getByRole("link", { name: "Oak home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
