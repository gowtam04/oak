/**
 * Citation span/row highlight (CIT-US-1). Wraps `<!-- span:id -->` marks and
 * fact-table rows; never invents a highlight when the anchor or mark is missing.
 */

"use client";

import { useState, type ReactNode } from "react";

import Markdown from "@/components/Markdown";
import type { Citation } from "@/components/types";

export interface CitationHighlightRow {
  name: string;
}

export interface CitationHighlightProps {
  markdown: string;
  citations: Citation[];
  rows?: CitationHighlightRow[];
  onOpenSource?: (citation: Citation) => void;
  /** Hide the standalone activator list (AnswerCard uses receipts instead). */
  hideActivators?: boolean;
  /** Controlled highlight; when omitted the component owns the tap state. */
  highlighted?: { target: "answer_span" | "fact_row"; id: string } | null;
}

const SPAN_RE =
  /<!--\s*span:([A-Za-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*\/span:\1\s*-->/g;

function splitSpans(markdown: string): Array<
  | { type: "text"; value: string }
  | { type: "span"; id: string; value: string }
> {
  const parts: Array<
    { type: "text"; value: string } | { type: "span"; id: string; value: string }
  > = [];
  let last = 0;
  const re = new RegExp(SPAN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: markdown.slice(last, match.index) });
    }
    parts.push({ type: "span", id: match[1]!, value: match[2]! });
    last = match.index + match[0].length;
  }
  if (last < markdown.length) {
    parts.push({ type: "text", value: markdown.slice(last) });
  }
  return parts;
}

export default function CitationHighlight({
  markdown,
  citations,
  rows,
  onOpenSource,
  hideActivators = false,
  highlighted = undefined,
}: CitationHighlightProps) {
  const [internal, setInternal] = useState<{
    target: "answer_span" | "fact_row";
    id: string;
  } | null>(null);
  const active = highlighted !== undefined ? highlighted : internal;

  function activate(citation: Citation) {
    const anchor = citation.anchor;
    if (anchor) setInternal(anchor);
    else setInternal(null);
    onOpenSource?.(citation);
  }

  const parts = splitSpans(markdown);

  return (
    <div className="citation-highlight">
      <div className="citation-highlight__markdown">
        {parts.map((part, i) => {
          if (part.type === "text") {
            return part.value ? (
              <Markdown key={`t-${i}`} markdown={part.value} />
            ) : null;
          }
          const isOn =
            active?.target === "answer_span" && active.id === part.id;
          return (
            <span
              key={`s-${part.id}-${i}`}
              className="citation-highlight__span"
              data-testid={`citation-span-${part.id}`}
              data-highlighted={isOn ? "true" : undefined}
            >
              {part.value}
            </span>
          );
        })}
      </div>

      {rows && rows.length > 0 && (
        <div className="citation-highlight__rows">
          {rows.map((row) => {
            const isOn =
              active?.target === "fact_row" && active.id === row.name;
            return (
              <div
                key={row.name}
                data-testid={`citation-row-${row.name}`}
                data-highlighted={isOn ? "true" : undefined}
              >
                {row.name}
              </div>
            );
          })}
        </div>
      )}

      {!hideActivators && (
        <ul className="citation-highlight__activators">
          {citations.map((citation, i) => (
            <li key={i}>
              <button
                type="button"
                data-testid={`citation-activate-${i}`}
                onClick={() => activate(citation)}
              >
                {citation.detail || citation.source}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HighlightedClaim({
  children,
  highlighted,
}: {
  children: ReactNode;
  highlighted: boolean;
}) {
  return (
    <span data-highlighted={highlighted ? "true" : undefined}>{children}</span>
  );
}
