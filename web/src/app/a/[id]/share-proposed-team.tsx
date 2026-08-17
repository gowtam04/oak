/**
 * Read-only proposed-team roster on a public share. Save / Apply onto existing
 * / SavedTeamCard / owner-team chrome stay off this page (ADR-12, ADR-13):
 * import is Open in Oak only.
 */

import { formatLabel, titleizeSlug } from "@/components/teams/display-names";
import TeamWarnings from "@/components/teams/TeamWarnings";
import type { OakAnswer } from "@/agent/schemas";

function titleize(value: string | null): string {
  return titleizeSlug(value, "—");
}

export default function ShareProposedTeam({
  proposedTeam,
  warnings = [],
}: {
  proposedTeam: NonNullable<OakAnswer["proposed_team"]>;
  warnings?: NonNullable<OakAnswer["proposed_team_warnings"]>;
}) {
  const { name, format, members } = proposedTeam;
  return (
    <section className="proposed-team" data-testid="share-proposed-team">
      <header className="proposed-team__header">
        <span className="proposed-team__name">{name}</span>
        <span className="proposed-team__format">{formatLabel(format)}</span>
      </header>
      <ol className="proposed-team__members">
        {members.map((m, i) => (
          <li key={i} className="proposed-team__member">
            <span className="proposed-team__species">{titleize(m.species)}</span>
            {m.item && (
              <span className="proposed-team__item"> @ {titleize(m.item)}</span>
            )}
            {m.ability && (
              <span className="proposed-team__ability">
                {" "}
                · {titleize(m.ability)}
              </span>
            )}
            {m.tera_type && (
              <span className="proposed-team__tera">
                {" "}
                · Tera {titleize(m.tera_type)}
              </span>
            )}
            {m.moves.length > 0 && (
              <span className="proposed-team__moves">
                {" "}
                — {m.moves.map(titleize).join(", ")}
              </span>
            )}
          </li>
        ))}
      </ol>
      <TeamWarnings
        warnings={warnings}
        title="Legality"
        testid="share-proposed-team-warnings"
      />
    </section>
  );
}
