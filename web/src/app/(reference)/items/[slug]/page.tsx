/**
 * /items/[slug] — a single item reference page: effect prose, availability
 * chips, wild holders, the forms that require it (Mega stones → their Mega
 * form, linked), and an "Ask Oak" CTA.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 *
 * `?format=<Format>` selects which scope's profile is shown (shareable). An
 * invalid or unavailable format soft-falls back to the default SV-first chain.
 * Canonical SEO URL stays `/items/{slug}` without the query.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import FormatChips from "@/components/reference/FormatChips";
import AskOakCta from "@/components/reference/AskOakCta";
import { isFormat, type Format } from "@/data/formats";
import { buildItemDescription, buildItemTitle } from "@/data/reference-metadata";

export const runtime = "nodejs";
export const revalidate = 86400;

/** Parse `?format=` into a known Format, or undefined when missing/invalid. */
function parseFormatParam(raw: string | string[] | undefined): Format | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !isFormat(value)) return undefined;
  return value;
}

/** Title-case a slug ("mystic-water" → "Mystic Water"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const preferred = parseFormatParam((await searchParams).format);
  const { loadItemPage } = await import("@/data/reference-pages");
  const data = await loadItemPage(slug, preferred);
  if (!data) return {};
  return {
    title: buildItemTitle(data),
    description: buildItemDescription(data),
    alternates: { canonical: `/items/${slug}` },
  };
}

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const preferred = parseFormatParam((await searchParams).format);
  const { loadItemPage } = await import("@/data/reference-pages");
  const data = await loadItemPage(slug, preferred);
  if (!data) notFound();

  const effect = data.effectFull || data.effectShort;

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/items">Items</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span>{data.displayName}</span>
      </nav>

      <div className="ref-card ref-detail-hero">
        <div className="ref-detail-hero__meta">
          <h1 className="ref-detail-hero__title">{data.displayName}</h1>
        </div>
      </div>

      {effect && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Effect</h2>
          <p className="ref-intro">{effect}</p>
        </section>
      )}

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">Availability</h2>
        <FormatChips
          formats={data.availability}
          activeFormat={data.sourceFormat}
          hrefFor={(f) => `/items/${slug}?format=${f}`}
        />
      </section>

      {data.requiredBy.length > 0 && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Required by</h2>
          <ul className="ref-formats">
            {data.requiredBy.map((r) => (
              <li key={r.slug} className="ref-formats__chip">
                <a href={`/pokedex/${r.slug}`}>{r.displayName}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.heldByWild.length > 0 && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Held by wild Pokémon</h2>
          <ul className="ref-usage__list">
            {data.heldByWild.map((h) => (
              <li key={h.pokemon} className="ref-usage__item">
                <span className="ref-usage__name">{titleCase(h.pokemon)}</span>
                <span className="ref-usage__pct mono-num">
                  {h.rarityPercent}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AskOakCta prompt={`Tell me about ${data.displayName}`} />
    </main>
  );
}
