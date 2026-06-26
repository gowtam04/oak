"use client";

import { useState } from "react";
import type { SourceListProps } from "@/components/types";

/**
 * SourceList — collapsible "Sources" section rendering `citations[]`.
 *
 * Each citation shows the source resource key, the specific datum used, and an
 * optional link to the canonical PokeAPI endpoint (BR-4).  Collapsed by default.
 *
 * Visual styling (icon, indent, link treatment) deferred to `frontend-design`.
 */
export default function SourceList({
  citations,
  defaultExpanded = false,
}: SourceListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    setExpanded((e.target as HTMLDetailsElement).open);
  }

  return (
    <details
      className="source-list"
      open={expanded}
      onToggle={handleToggle}
      data-testid="source-list"
    >
      <summary
        className="source-list__summary"
        data-testid="source-list-summary"
      >
        Sources ({citations.length})
      </summary>
      <ul className="source-list__list" data-testid="source-list-items">
        {citations.map((citation, i) => (
          <li
            key={i}
            className="source-list__item"
            data-testid={`citation-${i}`}
          >
            <span className="source-list__source">{citation.source}</span>
            <span className="source-list__detail"> — {citation.detail}</span>
            {citation.endpoint_url && (
              <a
                href={citation.endpoint_url}
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
        ))}
      </ul>
    </details>
  );
}
