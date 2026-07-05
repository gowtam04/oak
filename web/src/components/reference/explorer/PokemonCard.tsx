"use client";

/**
 * PokemonCard + ExtraCard — the sprite-anchored cards in the /pokedex grid.
 *
 * The whole card is a plain `<a>` (never next/link): these index pages are the
 * SEO crawl path and every species href MUST sit in the server-rendered HTML.
 * Next SSRs this client component, so the anchors ship in the initial payload;
 * a per-row next/link would mass-prefetch, and next/dynamic ssr:false would
 * drop the anchors from the crawlable HTML. Keep it a plain anchor.
 */

import { useState } from "react";

import SpriteImg from "@/components/SpriteImg";
import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import type { Format } from "@/data/formats";
import type { PokemonIndexRow } from "@/lib/reference-pages-types";
import { scopeLabelShort } from "@/lib/scope/scope-label";
import { guessShowdownAniSpriteUrl } from "@/lib/sprites";
import { safeHttpUrl } from "@/lib/safe-url";

/** Zero-padded dex readout, "#0445". */
function dexLabel(dexNumber: number): string {
  return `#${String(dexNumber).padStart(4, "0")}`;
}

export default function PokemonCard({ row }: { row: PokemonIndexRow }) {
  return (
    <li className="ref-cardcell">
      <a href={`/pokedex/${row.slug}`} className="ref-card ref-pcard">
        <div className="ref-pcard__well">
          {row.spriteUrl && (
            <SpriteImg
              src={row.spriteUrl}
              alt=""
              width={72}
              height={72}
              className="ref-pcard__sprite"
              loading="lazy"
            />
          )}
        </div>
        <span className="ref-pcard__name">{row.displayName}</span>
        <span className="ref-pcard__dex">{dexLabel(row.dexNumber)}</span>
        <span className="ref-pcard__types">
          {row.types.map((t) => (
            <TypeBadge key={t} type={t as TypeName} />
          ))}
        </span>
        <span className="ref-pcard__bst">{row.baseStatTotal} BST</span>
      </a>
    </li>
  );
}

export interface ExtraCardProps {
  slug: string;
  displayName: string;
  sourceFormat: Format;
}

/**
 * A compact "Other formats" card — a species that exists only outside the
 * scarlet-violet roster (Megas, past-gen forms). Its sprite is a best-effort
 * Showdown-ani GUESS (no DB sprite for these rows); the guess can 404, so the
 * image hides itself on error, leaving the sunken well as a neutral placeholder
 * rather than a broken-image glyph. Reuses `safeHttpUrl` (FE-02) exactly as
 * SpriteImg does — SpriteImg itself has no onError-hide, so we wrap a small
 * local `<img>` (the brief's sanctioned "wrap it" path).
 */
export function ExtraCard({ slug, displayName, sourceFormat }: ExtraCardProps) {
  const [failed, setFailed] = useState(false);
  const src = safeHttpUrl(guessShowdownAniSpriteUrl(slug));

  return (
    <li className="ref-cardcell">
      <a
        href={`/pokedex/${slug}`}
        className="ref-card ref-pcard ref-pcard--extra"
      >
        <div className="ref-pcard__well">
          {src && !failed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              width={72}
              height={72}
              loading="lazy"
              className="ref-pcard__sprite"
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <span className="ref-pcard__name">{displayName}</span>
        <span className="ref-pcard__scope">{scopeLabelShort(sourceFormat)}</span>
      </a>
    </li>
  );
}
