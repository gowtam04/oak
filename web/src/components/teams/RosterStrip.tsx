/**
 * RosterStrip — the 6-slot team roster shown above the focused member editor.
 *
 * Each slot is a large sprite card (species sprite + name + type dots + a held-
 * item pip) the user clicks to focus that member in the editor below; an empty
 * member renders a dashed pokeball "Add a Pokémon" placeholder, and a trailing
 * dashed pokeball tile appends a new blank slot (until the team is full at six).
 * Filled slots take a type edge/glow from `spriteBySpecies[species].types`
 * (soul.md Phase 2). Selection is a red record-light ring — not a left list rail.
 * Sprites/types come from the page's batch
 * `resolveSprites` lookup; an unknown species falls back to a Showdown sprite by
 * slug, then to a pokéball glyph. Dragging a slot onto another (when `onReorder`
 * is passed) inserts that member at the drop index. Pure presentational —
 * selection, add, reorder, and the member array all live in {@link TeamEditor}.
 */

"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";

import type { TeamMember } from "@/data/teams/team-schema";
import type { SpriteRef } from "@/lib/api/sprites-client";
import {
  guessOakMediaSpriteUrl,
  rewriteLegacyMediaUrl,
} from "@/lib/sprites";
import { plateFromTypes } from "@/lib/plate-types";
import { titleizeSlug } from "./display-names";

/**
 * One roster slot's sprite: prefers the DB/API `sprite_url` (Oak media after
 * re-ingest; legacy GitHub/Showdown URLs are rewritten onto the proxy), and
 * falls back to a slug-guessed Oak media URL on a load error — one-shot.
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

  const preferred = staticUrl
    ? rewriteLegacyMediaUrl(staticUrl)
    : guessOakMediaSpriteUrl(species);
  const fallback = guessOakMediaSpriteUrl(species);
  const src = errored && fallback !== preferred ? fallback : preferred;

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
        if (!errored && fallback && fallback !== preferred) setErrored(true);
      }}
    />
  );
}

export interface RosterStripProps {
  members: TeamMember[];
  selectedSlot: number;
  spriteBySpecies: Record<string, SpriteRef | undefined>;
  onSelect: (index: number) => void;
  /** Omit to hide the trailing add tile (archived view-only). */
  onAdd?: () => void;
  /** Omit to disable drag-to-reorder (archived / single-slot). */
  onReorder?: (from: number, to: number) => void;
}

export default function RosterStrip({
  members,
  selectedSlot,
  spriteBySpecies,
  onSelect,
  onAdd,
  onReorder,
}: RosterStripProps) {
  const canReorder = Boolean(onReorder) && members.length > 1;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const didDragRef = useRef(false);

  const onSlotDragStart = (index: number, e: DragEvent<HTMLButtonElement>) => {
    if (!canReorder) return;
    setDragFrom(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onSlotDragOver = (index: number, e: DragEvent<HTMLButtonElement>) => {
    if (!canReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== index) setDropTarget(index);
  };

  const onSlotDrop = (index: number, e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    didDragRef.current = true;
    const raw = e.dataTransfer.getData("text/plain");
    const from = dragFrom ?? (raw === "" ? Number.NaN : Number(raw));
    if (onReorder && Number.isInteger(from)) onReorder(from, index);
    setDragFrom(null);
    setDropTarget(null);
  };

  const onSlotDragEnd = () => {
    setDragFrom(null);
    setDropTarget(null);
  };

  return (
    <div className="roster-strip" data-testid="roster-strip" role="tablist" aria-label="Team roster">
      {members.map((member, i) => {
        const species = member.species;
        const ref = species ? spriteBySpecies[species] : undefined;
        const types = ref?.types ?? [];
        const selected = i === selectedSlot;
        // Type edge/glow for filled slots; empty slots stay untyped (dashed).
        const plate = species && types.length > 0 ? plateFromTypes(types) : null;
        const slotStyle = (plate?.style ?? undefined) as CSSProperties | undefined;
        return (
          <button
            type="button"
            key={i}
            role="tab"
            aria-selected={selected}
            draggable={canReorder}
            data-testid={`roster-slot-${i}`}
            data-selected={selected ? "true" : "false"}
            data-empty={species ? "false" : "true"}
            data-plate={plate?.kind}
            data-dragging={dragFrom === i ? "true" : "false"}
            data-drop-target={dropTarget === i && dragFrom !== i ? "true" : "false"}
            className="roster-slot"
            style={slotStyle}
            onClick={() => {
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              onSelect(i);
            }}
            onDragStart={(e) => onSlotDragStart(i, e)}
            onDragOver={(e) => onSlotDragOver(i, e)}
            onDrop={(e) => onSlotDrop(i, e)}
            onDragEnd={onSlotDragEnd}
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

      {members.length < 6 && onAdd && (
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
