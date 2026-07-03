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
 */

import { scopeLabelShort } from "@/lib/scope/scope-label";
import type { Format } from "@/data/formats";

export interface FormatChipsProps {
  formats: string[];
}

export default function FormatChips({ formats }: FormatChipsProps) {
  if (formats.length === 0) return null;

  return (
    <ul className="ref-formats" data-testid="format-chips">
      {formats.map((f) => (
        <li key={f} className="ref-formats__chip">
          {scopeLabelShort(f as Format)}
        </li>
      ))}
    </ul>
  );
}
