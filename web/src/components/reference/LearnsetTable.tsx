/**
 * LearnsetTable — a Pokémon's movepool grouped by learn method (level-up,
 * machine, tutor, …), one `<h3>` + `<table>` per method. Each move name links
 * to its `/moves/[slug]` page (part of the crawl spine) with a `TypeBadge`
 * when the move's type is known.
 */

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";

export interface LearnsetMoveRow {
  slug: string;
  displayName: string;
  type?: string | null;
  power?: number | null;
  damageClass?: string | null;
}

export interface LearnsetMethodGroup {
  /** e.g. "Level-up", "TM/TR", "Tutor". */
  method: string;
  moves: LearnsetMoveRow[];
}

export interface LearnsetTableProps {
  groups: LearnsetMethodGroup[];
}

export default function LearnsetTable({ groups }: LearnsetTableProps) {
  return (
    <div className="ref-learnset" data-testid="learnset-table">
      {groups.map((g) => (
        <section key={g.method} className="ref-learnset__group">
          <h3 className="ref-learnset__method">{g.method}</h3>
          <table className="ref-learnset__table">
            <tbody>
              {g.moves.map((m) => (
                <tr key={m.slug} className="ref-learnset__row">
                  <td className="ref-learnset__name">
                    <a href={`/moves/${m.slug}`}>{m.displayName}</a>
                  </td>
                  <td className="ref-learnset__type">
                    {m.type ? <TypeBadge type={m.type as TypeName} /> : null}
                  </td>
                  <td className="ref-learnset__power mono-num">
                    {m.power ?? "—"}
                  </td>
                  <td className="ref-learnset__class">
                    {m.damageClass ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
