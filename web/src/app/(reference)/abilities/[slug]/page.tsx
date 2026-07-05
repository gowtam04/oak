/**
 * /abilities/[slug] — a single ability reference page: effect prose,
 * availability chips, the full linked roster of Pokémon that can have it, and
 * an "Ask Oak" CTA.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import RefRosterList from "@/components/reference/RefRosterList";
import type { RefRosterGroup } from "@/components/reference/RefRosterList";
import FormatChips from "@/components/reference/FormatChips";
import AskOakCta from "@/components/reference/AskOakCta";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { loadAbilityPage } = await import("@/data/reference-pages");
  const data = await loadAbilityPage(slug);
  if (!data) return {};
  return {
    title: buildAbilityTitle(data),
    description: buildAbilityDescription(data),
    alternates: { canonical: `/abilities/${slug}` },
  };
}

export default async function AbilityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { loadAbilityPage } = await import("@/data/reference-pages");
  const data = await loadAbilityPage(slug);
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
        <FormatChips formats={data.availability} />
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
