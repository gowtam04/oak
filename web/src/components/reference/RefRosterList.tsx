/**
 * RefRosterList — the reverse-roster list on the two detail pages that carry
 * one: `/moves/[slug]` (Pokémon that can learn the move, grouped by learn
 * method) and `/abilities/[slug]` (Pokémon with the ability). Renders the
 * grouped structure the pages already compute as dense, hairline-separated
 * rows in the detail-page language (instrument-label group heading, row-hover
 * tint) so it reads like the rest of a `.ref-detail-section` card.
 *
 * Deliberately flat markup — one `<li><a>` per entry with no wrapper
 * components — so a long roster (hundreds of learners) stays cheap to render,
 * and every entry keeps a plain `<a>` link so the crawl spine survives. It
 * replaced `EntityIndexList` (the four index pages moved to the interactive
 * explorers; these two detail pages were its last consumers).
 */

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";

export interface RefRosterEntry {
  href: string;
  primary: string;
  secondary?: string | null;
  types?: string[];
  meta?: string | null;
}

export interface RefRosterGroup {
  heading: string;
  entries: RefRosterEntry[];
}

export interface RefRosterListProps {
  groups: RefRosterGroup[];
}

export default function RefRosterList({ groups }: RefRosterListProps) {
  return (
    <div className="ref-roster" data-testid="ref-roster-list">
      {groups.map((g) => (
        <section key={g.heading} className="ref-roster__group">
          <h3 className="ref-roster__heading">{g.heading}</h3>
          <ul className="ref-roster__list">
            {g.entries.map((e) => (
              <li key={e.href} className="ref-roster__row">
                <a href={e.href} className="ref-roster__entry">
                  <span className="ref-roster__primary">{e.primary}</span>
                  {e.secondary && (
                    <span className="ref-roster__secondary">{e.secondary}</span>
                  )}
                  {e.types && e.types.length > 0 && (
                    <span className="ref-roster__types">
                      {e.types.map((t) => (
                        <TypeBadge key={t} type={t as TypeName} />
                      ))}
                    </span>
                  )}
                  {e.meta && <span className="ref-roster__meta">{e.meta}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
