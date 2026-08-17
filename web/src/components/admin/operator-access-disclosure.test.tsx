import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import Markdown from "@/components/Markdown";

import {
  OPERATOR_ACCESS_DISCLOSURE_MARKDOWN,
  PUBLIC_SNAPSHOT_DISCLOSURE_MARKDOWN,
} from "./operator-access-disclosure";

/**
 * Pins the privacy disclosures the public privacy page embeds verbatim:
 *  - Phase 9 operator-access / usage recording (ADMIN-BR-7, AD-3)
 *  - Phase 11 public snapshots (SHARE-BR-4, AUTH-BR-2, CQ-OQ-1)
 *
 * Renders through the same `Markdown` component the privacy page uses, so we also
 * confirm the disclosure renders cleanly (no raw markdown leaking, valid GFM).
 */
describe("operator-access-disclosure (privacy copy)", () => {
  // Render through the real Markdown component, then collapse soft line breaks
  // (react-markdown preserves them as literal "\n") so phrase assertions are
  // resilient to where the source copy happens to wrap.
  function renderedText(): string {
    const { container } = render(
      <Markdown markdown={OPERATOR_ACCESS_DISCLOSURE_MARKDOWN} />,
    );
    return (container.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  it("renders the disclosure section heading", () => {
    render(<Markdown markdown={OPERATOR_ACCESS_DISCLOSURE_MARKDOWN} />);
    expect(
      screen.getByRole("heading", { name: /operational records and operator access/i }),
    ).toBeInTheDocument();
  });

  it("discloses one persisted record per chat turn, including guests", () => {
    const text = renderedText();
    expect(text).toContain("One record per chat turn");
    // prompt + answer are both stored
    expect(text).toContain("your message text and Oak's answer");
    // explicitly covers guests, not just signed-in users
    expect(text).toMatch(/whether you are signed in or using Oak as a guest/i);
  });

  it("discloses that auth events are recorded", () => {
    const text = renderedText();
    expect(text).toContain("One record per sign-in event");
    expect(text).toMatch(/one-time sign-in code is requested, verified, or fails/i);
  });

  it("discloses indefinite retention", () => {
    expect(renderedText()).toMatch(/retained\s+indefinitely/i);
  });

  it("discloses that the single operator can read account and guest conversations", () => {
    const text = renderedText();
    expect(text).toMatch(/can be read by Oak's\s+operator/i);
    expect(text).toMatch(/single owner who runs the service/i);
    expect(text).toMatch(/conversations and questions of both signed-in and guest users/i);
  });

  it("reaffirms no user-to-user exposure and no selling of data", () => {
    const text = renderedText();
    expect(text).toMatch(/never shown to any other user/i);
    expect(text).toMatch(/does not sell your personal information/i);
  });

  it("renders as markdown (a real list, no leaked ** markers)", () => {
    const { container } = render(
      <Markdown markdown={OPERATOR_ACCESS_DISCLOSURE_MARKDOWN} />,
    );
    expect(container.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent ?? "").not.toContain("**");
  });
});

describe("public-snapshot disclosure (privacy copy)", () => {
  function renderedText(): string {
    const { container } = render(
      <Markdown markdown={PUBLIC_SNAPSHOT_DISCLOSURE_MARKDOWN} />,
    );
    return (container.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  it("renders the disclosure section heading", () => {
    render(<Markdown markdown={PUBLIC_SNAPSHOT_DISCLOSURE_MARKDOWN} />);
    expect(
      screen.getByRole("heading", { name: /public share links/i }),
    ).toBeInTheDocument();
  });

  it("discloses that a signed-in user can publish a question-and-answer snapshot", () => {
    const text = renderedText();
    expect(text).toMatch(/if you are signed in/i);
    expect(text).toContain("your question and Oak's answer");
    expect(text).toMatch(/anyone with that link/i);
    expect(text).toMatch(/do not need an Oak account/i);
  });

  it("discloses that share pages are noindex", () => {
    expect(renderedText()).toMatch(/noindex/i);
  });

  it("discloses that the owner can revoke a share", () => {
    const text = renderedText();
    expect(text).toMatch(/you can revoke a share/i);
    expect(text).toMatch(/becomes unavailable/i);
  });

  it("discloses that shares are deleted with the account", () => {
    const text = renderedText();
    expect(text).toMatch(/delete your account/i);
    expect(text).toMatch(/deleted with it/i);
  });

  it("reaffirms that operator visibility of turns is unchanged", () => {
    const text = renderedText();
    expect(text).toMatch(/does not change/i);
    expect(text).toMatch(/operator's access to chat turns/i);
  });

  it("renders as markdown (a real list, no leaked ** markers)", () => {
    const { container } = render(
      <Markdown markdown={PUBLIC_SNAPSHOT_DISCLOSURE_MARKDOWN} />,
    );
    expect(container.querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
    expect(container.textContent ?? "").not.toContain("**");
  });
});
