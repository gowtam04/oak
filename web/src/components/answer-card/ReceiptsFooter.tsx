"use client";

import { useState } from "react";
import type { Citation } from "@/components/types";
import Markdown from "@/components/Markdown";
import EntityLink from "@/components/artifact/EntityLink";
import { parseCitationSource } from "@/components/artifact/parse-citation";
import { displayCitationSource } from "@/components/artifact/citation-display";
import { safeHttpUrl } from "@/lib/safe-url";

export interface ReceiptsFooterProps {
  reasoningMarkdown: string;
  citations: Citation[];
  /** Expanded on first render (default: false → collapsed). */
  defaultExpanded?: boolean;
}

/**
 * ReceiptsFooter — full-width specimen-plate foot tab that unifies reasoning +
 * citations under one expandable: `RECEIPTS · N SOURCE(S)` (soul.md).
 *
 * Expands inline to reasoning markdown and the citation list. Keeps the same
 * citation entity-link / safe-url behavior as SourceList (B-4, FE-01).
 *
 * SourceList remains for artifact surfaces that still want a standalone
 * "Sources" disclosure; AnswerCard uses this unified footer.
 */
export default function ReceiptsFooter({
  reasoningMarkdown,
  citations,
  defaultExpanded = false,
}: ReceiptsFooterProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const n = citations.length;
  const label = `RECEIPTS · ${n} SOURCE${n === 1 ? "" : "S"}`;

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    setExpanded((e.target as HTMLDetailsElement).open);
  }

  return (
    <details
      className="receipts"
      open={expanded}
      onToggle={handleToggle}
      data-testid="receipts-footer"
    >
      <summary className="receipts__tab" data-testid="receipts-summary">
        <span className="ilabel receipts__label">{label}</span>
        <span className="receipts__chevron" aria-hidden="true" />
      </summary>
      <div className="receipts__panel">
        {reasoningMarkdown ? (
          <div
            className="receipts__block reasoning-block"
            data-testid="reasoning-block"
          >
            <span className="ilabel receipts__block-label">Reasoning</span>
            <div
              className="reasoning-block__content"
              data-testid="reasoning-block-content"
            >
              <Markdown markdown={reasoningMarkdown} />
            </div>
          </div>
        ) : null}

        <div
          className="receipts__block source-list"
          data-testid="source-list"
        >
          <span
            className="ilabel receipts__block-label source-list__summary"
            data-testid="source-list-summary"
          >
            Sources{" "}
            <span className="source-list__count mono-num">({n})</span>
          </span>
          <ul className="source-list__list" data-testid="source-list-items">
            {citations.map((citation, i) => {
              const parsed = parseCitationSource(citation.source);
              const href = safeHttpUrl(citation.endpoint_url);
              const displaySource = displayCitationSource(citation.source);
              return (
                <li
                  key={i}
                  className="source-list__item"
                  data-testid={`citation-${i}`}
                >
                  {parsed ? (
                    <EntityLink
                      kind={parsed.kind}
                      q={parsed.q}
                      className="source-list__source-link"
                      testid={`citation-entity-${i}`}
                    >
                      {displaySource}
                    </EntityLink>
                  ) : (
                    <span className="source-list__source">{displaySource}</span>
                  )}
                  <span className="source-list__detail">
                    {" "}
                    — {citation.detail}
                  </span>
                  {href && (
                    <a
                      href={href}
                      className="source-list__link"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`citation-link-${i}`}
                    >
                      {" "}
                      ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}
