/**
 * /abilities/[slug] — a single ability reference page: effect prose,
 * availability chips, the full linked roster of Pokémon that can have it, and
 * an "Ask Oak" CTA.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 *
 * `?format=<Format>` selects which scope's profile is shown (shareable). An
 * invalid or unavailable format soft-falls back to the default SV-first chain.
 * Canonical SEO URL stays `/abilities/{slug}` without the query.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import RefRosterList from "@/components/reference/RefRosterList";
import type { RefRosterGroup } from "@/components/reference/RefRosterList";
import FormatChips from "@/components/reference/FormatChips";
import AskOakCta from "@/components/reference/AskOakCta";
import { isFormat, type Format } from "@/data/formats";
import {
  buildAbilityDescription,
  buildAbilityTitle,
} from "@/data/reference-metadata";
import type { AbilityPageData } from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const revalidate = 86400;

/** The "learned by" roster as a single sorted index group. */
function holderGroups(data: AbilityPageData): RefRosterGroup[] {
  if (data.learnedBy.length === 0) return [];
  const entries = [...data.learnedBy]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((h) => ({ href: `/pokedex/${h.slug}`, primary: h.displayName }));
  return [{ heading: `Pokémon with ${data.displayName}`, entries }];
}

/** Parse `?format=` into a known Format, or undefined when missing/invalid. */
function parseFormatParam(raw: string | string[] | undefined): Format | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !isFormat(value)) return undefined;
  return value;
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
  const { loadAbilityPage } = await import("@/data/reference-pages");
  const data = await loadAbilityPage(slug, preferred);
  if (!data) return {};
  return {
    title: buildAbilityTitle(data),
    description: buildAbilityDescription(data),
    alternates: { canonical: `/abilities/${slug}` },
  };
}

export default async function AbilityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const preferred = parseFormatParam((await searchParams).format);
  const { loadAbilityPage } = await import("@/data/reference-pages");
  const data = await loadAbilityPage(slug, preferred);
  if (!data) notFound();

  const effect = data.effectFull || data.effectShort;

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/abilities">Abilities</Link>
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
          hrefFor={(f) => `/abilities/${slug}?format=${f}`}
        />
      </section>

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">
          Pokémon with {data.displayName} ({data.learnedBy.length})
        </h2>
        {data.learnedBy.length > 0 ? (
          <RefRosterList groups={holderGroups(data)} />
        ) : (
          <p className="ref-intro">
            No Pokémon in this scope have {data.displayName}.
          </p>
        )}
      </section>

      <AskOakCta prompt={`Tell me about ${data.displayName}`} />
    </main>
  );
}
