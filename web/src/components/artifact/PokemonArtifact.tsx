/**
 * PokemonArtifact — the full species profile (B-4, AV-US-1, BR-AV-3): artwork,
 * dex number, clickable types, base stats, clickable abilities, the combined
 * defensive grid, and the movepool grouped by learn method with clickable,
 * type-badged moves.
 */

"use client";

import TypeBadge from "@/components/TypeBadge";
import SpriteImg from "@/components/SpriteImg";
import { typeDisplayIndex, type TypeName } from "@/agent/schemas";
import type { PokemonArtifactData } from "@/lib/entity-artifact";
import { pokeApiArtwork } from "@/lib/sprites";

import EntityLink from "./EntityLink";
import MatchupRow from "./MatchupRow";
import { statValueTier } from "./stat-tier";

const STAT_ROWS: { key: keyof PokemonArtifactData["base_stats"]; label: string }[] =
  [
    { key: "hp", label: "HP" },
    { key: "attack", label: "Attack" },
    { key: "defense", label: "Defense" },
    { key: "special_attack", label: "Sp. Atk" },
    { key: "special_defense", label: "Sp. Def" },
    { key: "speed", label: "Speed" },
  ];

/**
 * Stat meters normalize against a legible single-stat ceiling (well under the
 * theoretical 255 max) so typical base stats span the track instead of all
 * hugging the left rail (#9).
 */
const STAT_BAR_CEILING = 200;

function statPct(value: number): number {
  return Math.min(100, Math.round((value / STAT_BAR_CEILING) * 100));
}

/** Inline `--x` custom properties (React's CSSProperties rejects them by type). */
type CssVars = React.CSSProperties & Record<`--${string}`, string>;

/**
 * Title-case a slug-ish id (`cud-chew` → `Cud Chew`) for display. Mirrors the
 * helper in ProposedTeamCard; the raw slug is still handed to EntityLink `q=`
 * so links keep resolving (#3).
 */
function titleize(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Order a group's moves by type in Pokémon Champions display order, then
 * alphabetically by name within each type, so same-type moves cluster together
 * in the chip grid and their colored badges read as type groups. Untyped moves
 * sort last (typeDisplayIndex returns MAX_SAFE_INTEGER for "").
 */
function sortMovesByType<T extends { type: string; display_name: string }>(
  moves: readonly T[],
): T[] {
  return [...moves].sort(
    (a, b) =>
      typeDisplayIndex(a.type) - typeDisplayIndex(b.type) ||
      a.display_name.localeCompare(b.display_name),
  );
}

export interface PokemonArtifactProps {
  data: PokemonArtifactData;
}

export default function PokemonArtifact({
  data,
}: PokemonArtifactProps): React.JSX.Element {
  const { abilities, matchups } = data;
  // Titleize the DISPLAY label but keep the raw slug for EntityLink q= (#3);
  // the hidden flag drives a separate badge rather than inline text (#4).
  const abilityEntries: { slug: string; label: string; hidden: boolean }[] = [
    { slug: abilities.slot1, label: titleize(abilities.slot1), hidden: false },
  ];
  if (abilities.slot2) {
    abilityEntries.push({
      slug: abilities.slot2,
      label: titleize(abilities.slot2),
      hidden: false,
    });
  }
  if (abilities.hidden) {
    abilityEntries.push({
      slug: abilities.hidden,
      label: titleize(abilities.hidden),
      hidden: true,
    });
  }

  // quad_weak_to / quad_resists are produced by another track (contract B);
  // treat them as optional, defaulting to [] so magnitude rendering (#12) is
  // safe whether or not that track has landed.
  const defensive = matchups as typeof matchups & {
    quad_weak_to?: string[];
    quad_resists?: string[];
  };
  const quadWeakTo = defensive.quad_weak_to ?? [];
  const quadResists = defensive.quad_resists ?? [];

  // Order the matchup lists by Champions display order so this panel reads
  // consistently with the movepool. quad_* stay unsorted (membership-only).
  const orderTypes = (types: readonly string[]): string[] =>
    [...types].sort((a, b) => typeDisplayIndex(a) - typeDisplayIndex(b));

  // The halo (UI §4 screen 06) tints by the primary type at low opacity; a
  // Pokémon always has at least one type, but fall back to normal defensively.
  const primaryType = (data.types[0] ?? "normal") as TypeName;
  const haloStyle: CssVars = { "--halo-type": `var(--type-${primaryType})` };

  return (
    <div className="pokemon-artifact" data-testid="pokemon-artifact">
      <div className="pokemon-artifact__head">
        <span
          className="pokemon-artifact__halo"
          // eslint-disable-next-line react/forbid-dom-props -- dynamic --halo-type CSS var bound per species' primary type
          style={haloStyle}
        >
          <SpriteImg
            className="pokemon-artifact__art"
            src={data.artwork_url || data.sprite_url}
            fallbackSrc={pokeApiArtwork(data.national_dex_number)}
            alt={data.display_name}
            width={104}
            height={104}
          />
        </span>
        <div className="pokemon-artifact__id">
          <span className="pokemon-artifact__name">{data.display_name}</span>
          <span className="pokemon-artifact__dex mono-num">
            #{String(data.national_dex_number).padStart(3, "0")}
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
        <h3 className="artifact-section__title ilabel">Base stats</h3>
        <div data-testid="pokemon-stats">
          <ul className="stat-meters">
            {STAT_ROWS.map(({ key, label }) => {
              const value = data.base_stats[key];
              const fillStyle: CssVars = { "--fill": `${statPct(value)}%` };
              return (
                <li key={key} className="stat-meter">
                  <span className="stat-meter__label">{label}</span>
                  <span className="stat-meter__bar">
                    <span
                      className={`stat-meter__fill stat-meter__fill--${statValueTier(
                        value,
                      )}`}
                      // eslint-disable-next-line react/forbid-dom-props -- runtime-computed fill width, animated via the --fill custom property
                      style={fillStyle}
                    />
                  </span>
                  <span className="stat-meter__value mono-num">{value}</span>
                </li>
              );
            })}
          </ul>
          <div className="stat-meters__bst">
            <span className="ilabel">BST</span>
            <span className="mono-num">{data.base_stat_total}</span>
          </div>
        </div>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title ilabel">Abilities</h3>
        <div className="ability-chips" data-testid="pokemon-abilities">
          {abilityEntries.map((a) => (
            <EntityLink
              key={a.slug}
              kind="ability"
              q={a.slug}
              className="entity-link--chip"
            >
              {a.label}
              {a.hidden && (
                <span className="ability-chip__hidden-badge">Hidden</span>
              )}
            </EntityLink>
          ))}
        </div>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title ilabel">Type matchups</h3>
        <div className="matchup-grid" data-testid="pokemon-matchups">
          <MatchupRow
            label="Weak to"
            types={orderTypes(matchups.weak_to)}
            testid="matchups-weak"
            multiplierFor={(t) => (quadWeakTo.includes(t) ? "×4" : "×2")}
          />
          <MatchupRow
            label="Resists"
            types={orderTypes(matchups.resists)}
            testid="matchups-resists"
            multiplierFor={(t) => (quadResists.includes(t) ? "×¼" : "×½")}
          />
          <MatchupRow
            label="Immune to"
            types={orderTypes(matchups.immune_to)}
            testid="matchups-immune"
            multiplierFor={() => "×0"}
          />
        </div>
      </section>

      <section className="pokemon-artifact__section">
        <h3 className="artifact-section__title ilabel">Movepool</h3>
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
                <h4 className="movepool__method ilabel">{group.method}</h4>
                <ul className="movepool__moves">
                  {sortMovesByType(group.moves).map((move) => {
                    const moveType = (move.type || "normal") as TypeName;
                    const dotStyle: CssVars = {
                      "--dot-type": `var(--type-${moveType})`,
                    };
                    return (
                      <li key={move.slug} className="movepool__move">
                        <EntityLink
                          kind="move"
                          q={move.slug}
                          className="entity-link--move"
                          testid={`movepool-move-${move.slug}`}
                          title={move.type ? `${titleize(move.type)}-type move` : undefined}
                        >
                          {move.type && (
                            <span
                              className="movepool__type-dot"
                              // eslint-disable-next-line react/forbid-dom-props -- dynamic --dot-type CSS var bound per move's type
                              style={dotStyle}
                              aria-hidden
                            />
                          )}
                          {move.display_name}
                        </EntityLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
