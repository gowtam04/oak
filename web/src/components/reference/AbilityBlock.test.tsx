import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import AbilityBlock from "./AbilityBlock";

describe("AbilityBlock", () => {
  it("links each ability to its /abilities/[slug] page", () => {
    render(
      <AbilityBlock
        abilities={[{ slug: "rough-skin", displayName: "Rough Skin" }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Rough Skin" })).toHaveAttribute(
      "href",
      "/abilities/rough-skin",
    );
  });

  it("marks the hidden ability slot", () => {
    render(
      <AbilityBlock
        abilities={[
          { slug: "rough-skin", displayName: "Rough Skin" },
          { slug: "sand-veil", displayName: "Sand Veil", isHidden: true },
        ]}
      />,
    );
    expect(screen.getByText("(hidden)")).toBeInTheDocument();
  });

  it("renders effect text when provided", () => {
    render(
      <AbilityBlock
        abilities={[
          {
            slug: "rough-skin",
            displayName: "Rough Skin",
            effectShort: "Damages the attacker on contact.",
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Damages the attacker on contact."),
    ).toBeInTheDocument();
  });
});
