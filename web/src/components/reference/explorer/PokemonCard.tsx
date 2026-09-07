"use client";

/**
 * PokemonCard — the sprite-anchored cards in the /pokedex grid.
 *
 * The whole card is a plain `<a>` (never next/link): these index pages are the
 * SEO crawl path and every species href MUST sit in the server-rendered HTML.
 * Next SSRs this client component, so the anchors ship in the initial payload;
 * a per-row next/link would mass-prefetch, and next/dynamic ssr:false would
 * drop the anchors from the crawlable HTML. Keep it a plain anchor.
 */

import SpriteImg from "@/components/SpriteImg";
import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import type { PokemonIndexRow } from "@/lib/reference-pages-types";

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
