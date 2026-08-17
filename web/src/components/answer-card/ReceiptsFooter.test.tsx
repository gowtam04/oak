import type { ComponentProps } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

afterEach(() => cleanup());

import ReceiptsFooter from "./ReceiptsFooter";
import { CANONICAL_ANSWER } from "@/components/test-fixtures";

describe("ReceiptsFooter", () => {
  const citations = CANONICAL_ANSWER.citations;
  const markdown = CANONICAL_ANSWER.reasoning_markdown;

  it("renders a Why · Sources disclosure with the source count", () => {
    render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    const details = screen.getByTestId("receipts-footer") as HTMLDetailsElement;
    expect(details.tagName).toBe("DETAILS");
    expect(screen.getByTestId("receipts-summary")).toHaveTextContent(
      "Why · Sources (2)",
    );
  });

  it("still names Sources when there is exactly one citation", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations.slice(0, 1)}
      />,
    );
    expect(screen.getByTestId("receipts-summary")).toHaveTextContent(
      "Why · Sources (1)",
    );
  });

  it("is collapsed by default", () => {
    render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
  });

  it("expands when defaultExpanded=true", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(true);
  });

  it("embeds reasoning and citations when open", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    expect(screen.getByTestId("reasoning-block-content")).toHaveTextContent(
      "query_pokedex",
    );
    expect(screen.getByTestId("citation-0")).toBeInTheDocument();
  });

  it("honours controlled open state after defaultExpanded", () => {
    const { rerender } = render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
    rerender(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    // defaultExpanded only applies on first mount; re-render keeps prior state.
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
  });

  it("hides Copy for agents when no answer is provided", () => {
    render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    expect(screen.queryByTestId("copy-for-agents")).toBeNull();
  });

  it("copies machine markdown when Copy for agents is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        answer={CANONICAL_ANSWER}
      />,
    );
    const btn = screen.getByTestId("copy-for-agents");
    expect(btn).toHaveTextContent("Copy for agents");
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0]![0] as string;
    expect(md).toContain("# Oak answer");
    expect(md).toContain("**Status:**");
    await waitFor(() => expect(btn).toHaveTextContent("Copied"));
  });
});

describe("ReceiptsFooter — human copy + share (COPY-US-1, SHARE-US-1)", () => {
  const citations = CANONICAL_ANSWER.citations;
  const markdown = CANONICAL_ANSWER.reasoning_markdown;

  type FooterQolProps = ComponentProps<typeof ReceiptsFooter> & {
    onShare?: () => void;
    signedIn?: boolean;
  };

  function renderFooter(over: Partial<FooterQolProps> = {}) {
    const props: FooterQolProps = {
      reasoningMarkdown: markdown,
      citations,
      answer: CANONICAL_ANSWER,
      ...over,
    };
    render(
      <ReceiptsFooter {...(props as ComponentProps<typeof ReceiptsFooter>)} />,
    );
  }

  it("copies human text, not the agent citation schema (COPY-AC-1.1, COPY-AC-1.2)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderFooter();
    const btn = screen.getByRole("button", { name: /copy as human text/i });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0]![0] as string;
    expect(md).toContain(CANONICAL_ANSWER.answer_markdown);
    expect(md).not.toContain("# Oak answer");
    expect(md).not.toContain("**Status:**");
    expect(md).not.toContain("query_pokedex");
  });

  it("keeps Copy for agents as a distinct action (COPY-AC-1.3, COPY-BR-2)", () => {
    renderFooter();
    expect(screen.getByTestId("copy-for-agents")).toHaveTextContent(
      "Copy for agents",
    );
    expect(
      screen.getByRole("button", { name: /copy as human text/i }),
    ).toBeInTheDocument();
  });

  it("shows Share when signed in (SHARE-AC-1.1)", () => {
    const onShare = vi.fn();
    renderFooter({ signedIn: true, onShare });
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("hides Share for guests (SHARE-AC-1.2)", () => {
    renderFooter({ signedIn: false });
    expect(screen.queryByRole("button", { name: /^share$/i })).toBeNull();
  });
});
