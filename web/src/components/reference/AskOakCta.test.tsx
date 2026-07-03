import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import AskOakCta from "./AskOakCta";

describe("AskOakCta", () => {
  it("links to / with the prompt percent-encoded as ?q=", () => {
    render(<AskOakCta prompt="Tell me about Garchomp" />);
    const link = screen.getByTestId("ask-oak-cta");
    expect(link).toHaveAttribute(
      "href",
      "/?q=Tell%20me%20about%20Garchomp",
    );
  });

  it("renders the prompt text", () => {
    render(<AskOakCta prompt="Tell me about Garchomp" />);
    expect(screen.getByText("Tell me about Garchomp")).toBeInTheDocument();
  });

  it("encodes special characters safely", () => {
    render(<AskOakCta prompt="What beats Garchomp & co?" />);
    const link = screen.getByTestId("ask-oak-cta");
    expect(link.getAttribute("href")).toBe(
      `/?q=${encodeURIComponent("What beats Garchomp & co?")}`,
    );
  });
});
