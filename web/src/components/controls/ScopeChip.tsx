"use client";

/**
 * ScopeChip — a small, read-only pill showing the game scope the server
 * resolved for the latest turn (generation-scope GS-C / §4.3).
 *
 * It is the visible counterpart to the new `scope` SSE event. Because scope is
 * resolved SERVER-SIDE (explicit in-message signal > sticky conversation scope
 * > toggle seed) and is never an LLM-visible input, the user needs a surface
 * that confirms which generation an answer is based on — a wrong inference is
 * then a one-tap correction, not a silently wrong answer. Rendered in the header
 * next to `ChampionsToggle`, driven off the hook's `resolvedScope`.
 *
 * PURE + PRESENTATIONAL: props are `{ format }` only — no hooks, no state, and
 * (like every component test in this folder) no db/repo/runtime imports, so the
 * jsdom project renders it with fixture props. The label copy lives in the
 * portable `scopeLabel` helper (`@/lib/scope/scope-label`) so a future iOS
 * client reuses the exact same strings.
 *
 * Styling is a static (non-branching) inline style over the shared design-token
 * CSS variables — a self-contained header pill that stays theme-consistent in
 * light and dark without depending on a `globals.css` rule.
 */

import type { Format } from "@/data/formats";
import { scopeLabel } from "@/lib/scope/scope-label";

type ScopeChipProps = {
  /** The server-resolved scope for the latest turn (from the `scope` event). */
  format: Format;
};

export default function ScopeChip({ format }: ScopeChipProps) {
  const label = scopeLabel(format);
  return (
    <span
      className="scope-chip"
      data-testid="scope-chip"
      data-format={format}
      title={`Answers are scoped to ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "var(--space-1) var(--space-2)",
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--border)",
        background: "var(--surface-sunken)",
        color: "var(--text-muted)",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
