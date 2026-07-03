/**
 * RosterStrip — the 6-slot team roster shown above the focused member editor.
 *
 * Each slot is a large sprite card (species sprite + name + type dots + a held-
 * item pip) the user clicks to focus that member in the editor below; an empty
 * member renders a dashed pokeball "Add a Pokémon" placeholder, and a trailing
 * dashed pokeball tile appends a new blank slot (until the team is full at six).
 * The selected card carries the one selection language — a red rail + soft fill.
 * Sprites/types come from the page's batch
 * `resolveSprites` lookup; an unknown species falls back to a Showdown sprite by
 * slug, then to a pokéball glyph. Pure presentational — selection, add, and the
 * member array all live in {@link TeamEditor}.
 */

"use client";

import { useEffect, useState } from "react";

import type { TeamMember } from "@/data/teams/team-schema";
import type { SpriteRef } from "@/lib/api/sprites-client";
import { guessShowdownAniSpriteUrl } from "@/lib/sprites";
import { titleizeSlug } from "./display-names";

/**
 * One roster slot's sprite (F2): PREFERS the animated Showdown GIF (guessed
 * from the species slug when the DB's `sprite_url` isn't already one) and
 * falls back to that static DB url on a load error — one-shot, so a second
 * failure just leaves the broken/placeholder image rather than looping.
 */
function RosterSprite({
  species,
  staticUrl,
}: {
  species: string;
  staticUrl: string | null;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [species, staticUrl]);

  const preferred = staticUrl?.endsWith(".gif")
    ? staticUrl
    : guessShowdownAniSpriteUrl(species);
  const src = errored ? staticUrl : preferred;

  if (!src) {
    return <span className="roster-slot__sprite-empty" aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => {
        if (!errored && staticUrl && staticUrl !== src) setErrored(true);
      }}
    />
  );
}

export interface RosterStripProps {
  members: TeamMember[];
  selectedSlot: number;
  spriteBySpecies: Record<string, SpriteRef | undefined>;
  onSelect: (index: number) => void;
  onAdd: () => void;
}

export default function RosterStrip({
  members,
  selectedSlot,
  spriteBySpecies,
  onSelect,
  onAdd,
}: RosterStripProps) {
  return (
    <div className="roster-strip" data-testid="roster-strip" role="tablist" aria-label="Team roster">
      {members.map((member, i) => {
        const species = member.species;
        const ref = species ? spriteBySpecies[species] : undefined;
        const types = ref?.types ?? [];
        const selected = i === selectedSlot;
        return (
          <button
            type="button"
            key={i}
            role="tab"
            aria-selected={selected}
            data-testid={`roster-slot-${i}`}
            data-selected={selected ? "true" : "false"}
            data-empty={species ? "false" : "true"}
            className="roster-slot"
            onClick={() => onSelect(i)}
          >
            <span className="roster-slot__index mono-num">{i + 1}</span>
            <span className="roster-slot__sprite">
              {species ? (
                <RosterSprite species={species} staticUrl={ref?.sprite_url ?? null} />
              ) : (
                <span className="roster-slot__sprite-empty" aria-hidden />
              )}
            </span>
            <span className="roster-slot__name">
              {species ? titleizeSlug(species) : "Add a Pokémon"}
            </span>
            {types.length > 0 && (
              <span className="roster-slot__types" aria-hidden>
                {types.map((t) => (
                  <span
                    key={t}
                    className={`roster-slot__type-dot type-badge--${t}`}
                  />
                ))}
              </span>
            )}
            {species && member.item && (
              <span className="roster-slot__item" title={titleizeSlug(member.item)}>
                <span className="roster-slot__item-pip" aria-hidden />
                {titleizeSlug(member.item)}
              </span>
            )}
          </button>
        );
      })}

      {members.length < 6 && (
        <button
          type="button"
          className="roster-slot roster-slot--add"
          data-testid="team-add-member"
          onClick={onAdd}
        >
          <span className="roster-slot__sprite">
            <span className="roster-slot__sprite-empty" aria-hidden />
          </span>
          <span className="roster-slot__name">Add a Pokémon</span>
        </button>
      )}
    </div>
  );
}
