"use client";

import { useState, type CSSProperties } from "react";
import type { SpriteCardProps } from "@/components/types";
import TypeBadge from "@/components/TypeBadge";
import SpriteImg from "@/components/SpriteImg";
import EntityLink from "@/components/artifact/EntityLink";
import AddToTeamPicker from "@/components/teams/AddToTeamPicker";
import { blankMember } from "@/data/teams/place-on-team";
import { oakMediaDexSpriteUrl } from "@/lib/sprites";
import { typeCssVar } from "@/lib/plate-types";
import type { Format } from "@/data/formats";

/**
 * SpriteCard — renders one entry from `subjects[]`: sprite image, display
 * name, optional Dex number, type badges, and a fallback indicator when
 * `is_fallback` is true (pre-Gen-9 data used per BR-1).
 *
 * The sprite and name open the Pokémon's artifact and each type badge opens that
 * type's artifact (B-4, AV-US-1) via `EntityLink` — whose no-op default keeps the
 * card fully renderable in isolation tests with no viewer provider mounted (TD-5).
 *
 * The sprite URL comes from the answer payload (Oak first-party media after
 * re-ingest); `SpriteImg` rewrites legacy GitHub/Showdown URLs and falls back to
 * the Oak dex-sprite proxy by national dex number if the primary 404s.
 *
 * Specimen desk: the well glows from the subject's types via `--plate-a` /
 * `--plate-b` (not the azure default).
 */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function SpriteCard({
  subject,
  signedIn = false,
  format = "national-dex",
}: SpriteCardProps & { signedIn?: boolean; format?: Format }) {
  const {
    name,
    dex_number,
    sprite_url,
    types,
    is_fallback,
    source_generation,
  } = subject;
  const [pickerOpen, setPickerOpen] = useState(false);

  const plateStyle = {
    ["--plate-a" as string]: typeCssVar(types[0]),
    ["--plate-b" as string]: typeCssVar(types[1] ?? types[0]),
  } as CSSProperties;

  return (
    <div
      className="sprite-card"
      style={plateStyle}
      data-testid="sprite-card"
    >
      <EntityLink
        kind="pokemon"
        q={name}
        className="sprite-card__sprite-link"
        testid="sprite-card-sprite-link"
      >
        <div className="sprite-card__well">
          <SpriteImg
            className="sprite-card__sprite"
            src={sprite_url}
            fallbackSrc={
              dex_number != null ? oakMediaDexSpriteUrl(dex_number) : undefined
            }
            alt={name}
            width={96}
            height={96}
          />
        </div>
      </EntityLink>
      <div className="sprite-card__info">
        <EntityLink
          kind="pokemon"
          q={name}
          className="sprite-card__name-link"
          testid="sprite-card-link"
        >
          <span className="sprite-card__name">
            {name}
            {dex_number != null && (
              <span className="sprite-card__dex"> #{dex_number}</span>
            )}
          </span>
        </EntityLink>
        {is_fallback && (
          <span
            className="sprite-card__fallback-badge"
            title={
              source_generation
                ? `Data from ${source_generation}`
                : "Pre-Gen 9 data"
            }
            data-testid="sprite-card-fallback"
          >
            {source_generation ?? "Fallback"}
          </span>
        )}
        <div className="sprite-card__types">
          {types.map((type) => (
            <EntityLink
              key={type}
              kind="type"
              q={type}
              className="entity-link--type"
            >
              <TypeBadge type={type} />
            </EntityLink>
          ))}
        </div>
        {signedIn && (
          <button
            type="button"
            className="sprite-card__add"
            onClick={() => setPickerOpen(true)}
          >
            Add to team
          </button>
        )}
      </div>
      {signedIn && pickerOpen && (
        <AddToTeamPicker
          incoming={{ ...blankMember(), species: slugify(name) }}
          format={format}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
