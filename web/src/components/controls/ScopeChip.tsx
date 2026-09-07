"use client";

/**
 * ScopeChip — display-only current Champions regulation indicator
 * (CF-CHAT-AC-1.2, CF-UI-US-2). It is not a National Dex / Gens 1–8 /
 * Scarlet-Violet picker: click does not open a game menu and does not
 * call `onSelect`.
 *
 * The chip always shows {@link CHAMPIONS_REGULATION} (short form on the
 * pill; full name on the tooltip). A passed `format` is ignored so a
 * stale other-game prop cannot relabel the chrome.
 *
 * `onSelect` / `disabled` / `recentFormats` remain on the props type so
 * existing callers type-check; they have no effect.
 *
 * PURE + jsdom-safe: only `@/data/formats` and react — no db/repo/runtime.
 */

import { CHAMPIONS_REGULATION, type Format } from "@/data/formats";

/** "Regulation M-B" → "Reg M-B" for the tight header pill. */
const CHAMPIONS_REG_SHORT = CHAMPIONS_REGULATION.replace(
  /^Regulation\b/,
  "Reg",
).trim();

const REGULATION_HINT = `Current Champions regulation: ${CHAMPIONS_REGULATION}`;

type ScopeChipProps = {
  /** Ignored — the chip always displays the current Champions regulation. */
  format?: Format;
  /** Ignored — click does not switch games (CF-UI-AC-2.2). */
  onSelect?: (format: Format) => void;
  /** Ignored — the chip is not interactive. */
  disabled?: boolean;
  /** Base for this instance's `data-testid` (default `"scope-chip"`). */
  testId?: string;
  /** Ignored — there is no format menu / MRU group. */
  recentFormats?: Format[];
};

export default function ScopeChip({
  testId = "scope-chip",
}: ScopeChipProps) {
  return (
    <span
      className="scope-chip"
      data-testid={testId}
      data-format="champions"
      title={REGULATION_HINT}
      aria-label={REGULATION_HINT}
    >
      {`Champions · ${CHAMPIONS_REG_SHORT}`}
    </span>
  );
}
