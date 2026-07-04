"use client";

/**
 * ScopeChip — a small pill showing the game scope the server resolved for the
 * latest turn (generation-scope GS-C / §4.3), and — since the Champions
 * toggle was removed from the UI (champions-default) — the header's ONLY
 * interactive scope control.
 *
 * It is the visible counterpart to the new `scope` SSE event. Because scope is
 * resolved SERVER-SIDE (explicit in-message signal > sticky conversation scope
 * > toggle seed) and is never an LLM-visible input, the user needs a surface
 * that confirms which generation an answer is based on — a wrong inference is
 * then a one-tap correction, not a silently wrong answer.
 *
 * Two render modes, selected by whether `onSelect` is passed:
 *   - ABSENT: today's plain, read-only pill (unchanged markup/attrs/styling —
 *     pinned by the existing display-only tests).
 *   - PRESENT: a menu button that opens a popover listing all six formats
 *     (`SCOPE_PICKER_ORDER`) as `menuitemradio` options — each a two-line row (name +
 *     one-line description, fable-ui §4 screen 02); picking one reports the new
 *     format via `onSelect` and closes the menu. Closes on Escape (refocusing
 *     the trigger) and on an outside pointerdown, mirroring the header's
 *     overflow-menu popover pattern (`src/app/page.tsx`).
 *
 * `testId` lets a second instance (the empty-state hero chip) render distinct
 * `data-testid`s so a page-level `getByTestId("scope-chip")` still resolves to
 * the single header chip.
 *
 * PURE + jsdom-safe: only `@/data/formats`, `@/lib/scope/scope-label`, and
 * react — no db/repo/runtime imports, so component tests render it with
 * fixture props alone.
 */

import { useEffect, useRef, useState } from "react";
import {
  CHAMPIONS_REGULATION,
  SCOPE_PICKER_ORDER,
  type Format,
} from "@/data/formats";
import { scopeLabel, scopeLabelShort } from "@/lib/scope/scope-label";

/**
 * The one-line description under each scope name in the picker (fable-ui §4
 * screen 02) — the game(s)/regulation the scope covers. Champions rides the
 * live regulation constant so it advances with a `@pkmn/mods` bump.
 */
const SCOPE_DESCRIPTIONS: Record<Format, string> = {
  champions: `Current ${CHAMPIONS_REGULATION}`,
  "scarlet-violet": "Scarlet / Violet",
  "gen-8": "Sword / Shield",
  "gen-7": "Ultra Sun / Ultra Moon",
  "gen-6": "X / Y · Omega Ruby / Alpha Sapphire",
  "gen-5": "Black / White",
};

type ScopeChipProps = {
  /** The server-resolved (or seeded) scope to display. */
  format: Format;
  /**
   * When provided, the chip becomes an interactive menu button; picking a
   * scope reports it here. Absent ⇒ the display-only pill (unchanged
   * rendering from before this control became interactive).
   */
  onSelect?: (format: Format) => void;
  /** Disable interaction while a turn is streaming. */
  disabled?: boolean;
  /** Base for this instance's `data-testid`s (default `"scope-chip"`). */
  testId?: string;
};

export default function ScopeChip({
  format,
  onSelect,
  disabled = false,
  testId = "scope-chip",
}: ScopeChipProps) {
  const label = scopeLabel(format);

  if (!onSelect) {
    return (
      <span
        className="scope-chip"
        data-testid={testId}
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

  return (
    <InteractiveScopeChip
      format={format}
      label={label}
      onSelect={onSelect}
      disabled={disabled}
      testId={testId}
    />
  );
}

function InteractiveScopeChip({
  format,
  label,
  onSelect,
  disabled,
  testId,
}: {
  format: Format;
  label: string;
  onSelect: (format: Format) => void;
  disabled: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Pulse the chip once whenever the resolved scope changes (feedback that a
  // pick / a server override took — fable-ui §4 screen 02). Skip the very first
  // render so the chip doesn't flash on load. CSS honors reduced-motion.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 300);
    return () => clearTimeout(id);
  }, [format]);

  function pick(next: Format) {
    onSelect(next);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="scope-chip-container">
      <button
        ref={triggerRef}
        type="button"
        className={"scope-chip" + (pulse ? " scope-chip--pulse" : "")}
        data-testid={testId}
        data-format={format}
        title={`Answers are scoped to ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className="scope-chip__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="scope-chip__menu"
          role="menu"
          data-testid={`${testId}-menu`}
        >
          <span className="ilabel scope-chip__menu-label">Answer scope</span>
          {SCOPE_PICKER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              role="menuitemradio"
              aria-checked={f === format}
              className="scope-chip__option"
              data-testid={`${testId}-option-${f}`}
              onClick={() => pick(f)}
            >
              <span className="scope-chip__option-name">
                {scopeLabelShort(f)}
              </span>
              <span className="scope-chip__option-desc">
                {SCOPE_DESCRIPTIONS[f]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
