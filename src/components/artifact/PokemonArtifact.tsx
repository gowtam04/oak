/**
 * PokemonArtifact — the full species profile (B-4, AV-US-1, BR-AV-3): artwork,
 * dex number, clickable types, base stats, clickable abilities, the combined
 * defensive grid, and the movepool grouped by learn method with clickable,
 * type-badged moves.
 */

"use client";

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import type { PokemonArtifactData } from "@/lib/entity-artifact";

import EntityLink from "./EntityLink";
import MatchupRow from "./MatchupRow";

const STAT_ROWS: { key: keyof PokemonArtifactData["base_stats"]; label: string }[] =
  [
    { key: "hp", label: "HP" },
    { key: "attack", label: "Attack" },
    { key: "defense", label: "Defense" },
    { key: "special_attack", label: "Sp. Atk" },
    { key: "special_defense", label: "Sp. Def" },
    { key: "speed", label: "Speed" },
  ];

/** Width of a stat bar as a % of a 255 ceiling (the max base stat). */
function statPct(value: number): string {
  return `${Math.min(100, Math.round((value / 255) * 100))}%`;
}

export interface PokemonArtifactProps {
  data: PokemonArtifactData;
}

export default function PokemonArtifact({
  data,
}: PokemonArtifactProps): React.JSX.Element {
  const { abilities } = data;
  const abilityEntries: { slug: string; label: string }[] = [
    { slug: abilities.slot1, label: abilities.slot1 },
  ];
  if (abilities.slot2) {
    abilityEntries.push({ slug: abilities.slot2, label: abilities.slot2 });
  }
  if (abilities.hidden) {
    abilityEntries.push({
      slug: abilities.hidden,
      label: `${abilities.hidden} (Hidden)`,
    });
  }

  return (
    <div className="pokemon-artifact" data-testid="pokemon-artifact">
      <div className="pokemon-artifact__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="pokemon-artifact__art"
          src={data.artwork_url || data.sprite_url}
          alt={data.display_name}
          width={160}
          height={160}
        />
        <div className="pokemon-artifact__id">
          <span className="pokemon-artifact__dex">
            #{data.national_dex_number}
          </span>
          <div className="pokemon-artifact__types">
            {data.types.map((t) => (
              <EntityLink
                key={t}
                kind="type"
                q={t}
                className="entity-link--type"
              >
                <TypeBadge type={t as TypeName} />
              </EntityLink>
            ))}
          </div>
        </div>
      </div>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title">Base stats</h3>
        <ul className="stat-list" data-testid="pokemon-stats">
          {STAT_ROWS.map(({ key, label }) => (
            <li key={key} className="stat-list__row">
              <span className="stat-list__label">{label}</span>
              <span className="stat-list__value">{data.base_stats[key]}</span>
              <span className="stat-list__bar">
                <span
                  className="stat-list__bar-fill"
                  style={{ width: statPct(data.base_stats[key]) }}
                />
              </span>
            </li>
          ))}
          <li className="stat-list__row stat-list__row--total">
            <span className="stat-list__label">Total</span>
            <span className="stat-list__value">{data.base_stat_total}</span>
            <span className="stat-list__bar" />
          </li>
        </ul>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title">Abilities</h3>
        <div className="ability-chips" data-testid="pokemon-abilities">
          {abilityEntries.map((a) => (
            <EntityLink
              key={a.label}
              kind="ability"
              q={a.slug}
              className="entity-link--chip"
            >
              {a.label}
            </EntityLink>
          ))}
        </div>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title">Type matchups</h3>
        <div className="matchup-grid" data-testid="pokemon-matchups">
          <MatchupRow
            label="Weak to"
            types={data.matchups.weak_to}
            testid="matchups-weak"
          />
          <MatchupRow
            label="Resists"
            types={data.matchups.resists}
            testid="matchups-resists"
          />
          <MatchupRow
            label="Immune to"
            types={data.matchups.immune_to}
            testid="matchups-immune"
          />
        </div>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title">Movepool</h3>
        {data.movepool.length === 0 ? (
          <p className="artifact-empty" data-testid="movepool-empty">
            No moves recorded for this format.
          </p>
        ) : (
          <div className="movepool" data-testid="pokemon-movepool">
            {data.movepool.map((group) => (
              <div
                key={group.method}
                className="movepool__group"
                data-testid={`movepool-group-${group.method}`}
              >
                <h4 className="movepool__method">{group.method}</h4>
                <ul className="movepool__moves">
                  {group.moves.map((move) => (
                    <li key={move.slug} className="movepool__move">
                      <EntityLink
                        kind="move"
                        q={move.slug}
                        className="entity-link--move"
                        testid={`movepool-move-${move.slug}`}
                      >
                        {move.display_name}
                        {move.type && (
                          <TypeBadge type={move.type as TypeName} />
                        )}
                      </EntityLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
