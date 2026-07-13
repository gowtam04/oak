/**
 * FormatChips — a chip per data scope an entity is available in (the
 * cross-format availability row on a detail page), labeled with the same
 * compact helper the header scope chip uses (`scopeLabelShort`), so a
 * reference page and the chat UI never disagree on a scope's name.
 *
 * Props are typed `string[]` (not `Format[]`) per the reference-components
 * convention of keeping props to primitives — the pages unit maps its
 * `Format[]` view-model field onto this directly since `Format` IS a string
 * union; an unrecognized value still renders (via `scopeLabelShort`'s
 * defensive fallback) instead of crashing.
 *
 * When `hrefFor` is provided (Pokédex detail), chips become links that switch
 * the displayed generation via `?format=`. `activeFormat` highlights the scope
 * currently shown. Without `hrefFor` chips stay read-only (moves / abilities /
 * items pages).
 */

import { scopeLabelShort } from "@/lib/scope/scope-label";
import type { Format } from "@/data/formats";

export interface FormatChipsProps {
  formats: string[];
  /** Currently displayed scope — highlighted when set. */
  activeFormat?: string;
  /**
   * Build the chip href. When omitted, chips are non-interactive labels.
   * When provided, every chip is a link (including the active one, for
   * shareable URLs that still show selection).
   */
  hrefFor?: (format: string) => string;
}

export default function FormatChips({
  formats,
  activeFormat,
  hrefFor,
}: FormatChipsProps) {
  if (formats.length === 0) return null;

  return (
    <ul className="ref-formats" data-testid="format-chips">
      {formats.map((f) => {
        const label = scopeLabelShort(f as Format);
        const isActive = activeFormat != null && activeFormat === f;
        const chipClass = [
          "ref-formats__chip",
          isActive ? "ref-formats__chip--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (hrefFor) {
          return (
            <li key={f} className={chipClass}>
              <a
                href={hrefFor(f)}
                aria-current={isActive ? "true" : undefined}
              >
                {label}
              </a>
            </li>
          );
        }

        return (
          <li
            key={f}
            className={chipClass}
            aria-current={isActive ? "true" : undefined}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}
