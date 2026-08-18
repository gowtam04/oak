/**
 * ComparisonArtifact — two subjects side-by-side. A user-started Compare
 * with… also carries a P5 `diffPokemonProfiles` result (CMP-US-1/3) so
 * the viewer is a real diff, not two bare sprites. Each column keeps its
 * own format tag (CMP-BR-2).
 */

"use client";

import SpriteCard from "@/components/answer-card/SpriteCard";
import type { Subject } from "@/agent/schemas";
import type { Format } from "@/data/formats";
import { formatLabel } from "@/components/teams/display-names";
import type { PokemonCompareDiff, SetDiff } from "@/lib/pokemon-compare";

export interface ComparisonArtifactProps {
  subjects: Subject[];
  signedIn?: boolean;
  diff?: PokemonCompareDiff;
}

const STAT_ROWS: { key: keyof PokemonCompareDiff["stats"]; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "special_attack", label: "Sp. Atk" },
  { key: "special_defense", label: "Sp. Def" },
  { key: "speed", label: "Speed" },
];

function DiffList({ label, diff }: { label: string; diff: SetDiff }) {
  return (
    <div className="comparison-artifact__diff-block">
      <h4 className="comparison-artifact__diff-title">{label}</h4>
      {diff.onlyLeft.length > 0 && (
        <p>
          <span className="ilabel">Only left</span> {diff.onlyLeft.join(", ")}
        </p>
      )}
      {diff.onlyRight.length > 0 && (
        <p>
          <span className="ilabel">Only right</span> {diff.onlyRight.join(", ")}
        </p>
      )}
      {diff.shared.length > 0 && (
        <p>
          <span className="ilabel">Shared</span> {diff.shared.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function ComparisonArtifact({
  subjects,
  signedIn = false,
  diff,
}: ComparisonArtifactProps): React.JSX.Element {
  const formats: (Format | undefined)[] = diff
    ? [diff.left.format, diff.right.format]
    : [];

  return (
    <div className="comparison-artifact" data-testid="comparison-artifact">
      <div className="comparison-artifact__cards">
        {subjects.map((subject, i) => (
          <div
            key={`${subject.name}-${i}`}
            className="comparison-artifact__card"
            data-testid={`comparison-subject-${i}`}
          >
            {formats[i] && (
              <span className="comparison-artifact__format ilabel">
                {formatLabel(formats[i]!)}
              </span>
            )}
            <SpriteCard
              subject={subject}
              signedIn={signedIn}
              format={formats[i]}
            />
          </div>
        ))}
      </div>

      {diff && (
        <div className="comparison-artifact__diff" data-testid="comparison-diff">
          <table className="comparison-artifact__stats">
            <thead>
              <tr>
                <th>Stat</th>
                <th>{diff.left.name}</th>
                <th>{diff.right.name}</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map((row) => {
                const s = diff.stats[row.key];
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td className="mono-num">{s.left}</td>
                    <td className="mono-num">{s.right}</td>
                    <td className="mono-num">
                      {s.delta > 0 ? `+${s.delta}` : s.delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="comparison-artifact__speed">
            Speed at L{diff.speed.level} {diff.speed.nature} (
            {diff.speed.source === "set" ? "from set" : "default"}):{" "}
            {diff.speed.left} vs {diff.speed.right} ({diff.speed.delta >= 0 ? "+" : ""}
            {diff.speed.delta})
          </p>

          <p>
            <span className="ilabel">Types</span> {diff.types.left.join("/")} vs{" "}
            {diff.types.right.join("/")}
          </p>

          <DiffList label="Abilities" diff={diff.abilities} />
          <DiffList label="Movepool" diff={diff.movepool} />
          <DiffList
            label="Weak to"
            diff={diff.matchups.defensive.weak_to}
          />
          <DiffList
            label="Resists"
            diff={diff.matchups.defensive.resists}
          />
          <DiffList
            label="Immune to"
            diff={diff.matchups.defensive.immune_to}
          />
          <DiffList
            label="Super-effective vs"
            diff={diff.matchups.offensive.super_effective_against}
          />
          <DiffList
            label="Not very effective vs"
            diff={diff.matchups.offensive.not_very_effective_against}
          />
          <DiffList
            label="No effect vs"
            diff={diff.matchups.offensive.no_effect_against}
          />
        </div>
      )}
    </div>
  );
}
