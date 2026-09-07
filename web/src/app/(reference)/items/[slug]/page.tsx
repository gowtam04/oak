/**
 * /items/[slug] — a single item reference page: effect prose, wild holders,
 * the forms that require it (Mega stones → their Mega form, linked), and an
 * "Ask Oak" CTA.
 *
 * Champions-only (CF-DEX-US-1): unknown slugs 404; no generation picker.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AskOakCta from "@/components/reference/AskOakCta";
import { buildItemDescription, buildItemTitle } from "@/data/reference-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Title-case a slug ("mystic-water" → "Mystic Water"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { loadItemPage } = await import("@/data/reference-pages");
  const data = await loadItemPage(slug);
  if (!data) return {};
  return {
    title: buildItemTitle(data),
    description: buildItemDescription(data),
    alternates: { canonical: `/items/${slug}` },
  };
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const { loadItemPage } = await import("@/data/reference-pages");
  const data = await loadItemPage(slug);
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
