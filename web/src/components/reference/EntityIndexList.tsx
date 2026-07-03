/**
 * EntityIndexList — the generic grouped-list renderer backing every
 * `/pokedex`, `/moves`, `/abilities`, `/items` index page (the crawl path:
 * every entity gets a discoverable `<a>` row). Deliberately flat markup —
 * one `<li><a>` per entry with no wrapper components — so a 1000+ row
 * Pokédex index stays cheap to render.
 */

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";

export interface EntityIndexEntry {
  href: string;
  primary: string;
  secondary?: string | null;
  types?: string[];
  meta?: string | null;
}

export interface EntityIndexGroup {
  heading: string;
  entries: EntityIndexEntry[];
}

export interface EntityIndexListProps {
  groups: EntityIndexGroup[];
}

export default function EntityIndexList({ groups }: EntityIndexListProps) {
  return (
    <div className="ref-index" data-testid="entity-index-list">
      {groups.map((g) => (
        <section key={g.heading} className="ref-index__group">
          <h2 className="ref-index__heading">{g.heading}</h2>
          <ul className="ref-index__list">
            {g.entries.map((e) => (
              <li key={e.href} className="ref-index__row">
                <a href={e.href} className="ref-index__entry">
                  <span className="ref-index__primary">{e.primary}</span>
                  {e.secondary && (
                    <span className="ref-index__secondary">
                      {e.secondary}
                    </span>
                  )}
                  {e.types && e.types.length > 0 && (
                    <span className="ref-index__types">
                      {e.types.map((t) => (
                        <TypeBadge key={t} type={t as TypeName} />
                      ))}
                    </span>
                  )}
                  {e.meta && <span className="ref-index__meta">{e.meta}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
