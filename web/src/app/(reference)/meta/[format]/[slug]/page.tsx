/**
 * /meta/[format]/[slug] — a single species' competitive-usage drill-in: rank,
 * usage %, a usage-trend sparkline, top moves/items/abilities/teammates/
 * spreads/checks-and-counters, a copyable Showdown-format representative set,
 * and an "Ask Oak" CTA.
 *
 * Detail route: `runtime = "nodejs"` + `revalidate = 86400`, NO
 * `generateStaticParams` — matches `/pokedex/[slug]` exactly (nothing
 * prerenders at build, so `@/env`/`@/data/db` are never evaluated at build
 * time; the first request renders and ISR-caches for 24h). Deliberately
 * LATEST-month only (no `searchParams` at all) — a `?month=` param on an
 * ISR-cached route would serve a stale month to every visitor regardless of
 * the query string, so month history lives only on the leaderboard page's
 * `dynamic = "force-dynamic"` route instead. An unknown format/slug or a
 * never-synced ladder all resolve to `notFound()` (the loader returns null
 * uniformly for all three — see `src/data/meta-pages.ts`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import MetaTrendSparkline from "@/components/meta/MetaTrendSparkline";
import MetaUsageLists from "@/components/meta/MetaUsageLists";
import type { MetaUsageSection } from "@/components/meta/MetaUsageLists";
import CopyShowdownSet from "@/components/meta/CopyShowdownSet";
import AskOakCta from "@/components/reference/AskOakCta";
import { formatMonthLabel } from "@/components/meta/month-label";
import { isMetaFormat, type MetaFormat } from "@/data/meta-formats";
import type { MetaSpeciesView } from "@/lib/meta-pages-types";

export const runtime = "nodejs";
export const revalidate = 86400;

async function loadSpecies(
  format: MetaFormat,
  slug: string,
): Promise<MetaSpeciesView | null> {
  const { loadMetaSpecies } = await import("@/data/meta-pages");
  return loadMetaSpecies(format, slug);
}

/** The six usage-list sections, in display order, per the drill-in's contract. */
function usageSections(
  format: MetaFormat,
  data: MetaSpeciesView,
): MetaUsageSection[] {
  return [
    {
      title: "Moves",
      entries: data.moves.map((m) => ({
        name: m.name,
        href: `/moves/${m.slug}`,
        valueLabel: `${m.pct.toFixed(1)}%`,
      })),
    },
    {
      title: "Items",
      entries: data.items.map((i) => ({
        name: i.name,
        href: `/items/${i.slug}`,
        valueLabel: `${i.pct.toFixed(1)}%`,
      })),
    },
    {
      title: "Abilities",
      entries: data.abilities.map((a) => ({
        name: a.name,
        href: `/abilities/${a.slug}`,
        valueLabel: `${a.pct.toFixed(1)}%`,
      })),
    },
    {
      title: "Teammates",
      entries: data.teammates.map((t) => ({
        name: t.name,
        href: `/meta/${format}/${t.slug}`,
        valueLabel: `${t.pct.toFixed(1)}%`,
      })),
    },
    {
      title: "Spreads",
      entries: data.spreads.map((s) => ({
        name: `${s.nature} ${s.evs}`,
        href: null,
        valueLabel: `${s.pct.toFixed(1)}%`,
      })),
    },
    {
      title: "Checks & Counters",
      entries: data.counters.map((c) => ({
        name: c.name,
        href: `/meta/${format}/${c.slug}`,
        valueLabel: `score ${c.score.toFixed(1)} · KOs or forces out ${c.ko_or_switch_pct.toFixed(1)}%`,
      })),
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ format: string; slug: string }>;
}): Promise<Metadata> {
  const { format, slug } = await params;
  if (!isMetaFormat(format)) return {};
  const data = await loadSpecies(format, slug);
  if (!data) return {};
  return {
    title: `${data.displayName} — ${data.label} usage`,
    alternates: { canonical: `/meta/${format}/${slug}` },
  };
}

export default async function MetaSpeciesPage({
  params,
}: {
  params: Promise<{ format: string; slug: string }>;
}) {
  const { format, slug } = await params;
  if (!isMetaFormat(format)) notFound();
  const data = await loadSpecies(format, slug);
  if (!data) notFound();

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/meta">Meta</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <Link href={`/meta/${format}`}>{data.label}</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span>{data.displayName}</span>
      </nav>

      <div className="ref-hero">
        <div>
          <h1 className="ref-hero__title">{data.displayName}</h1>
          {data.hasDexPage && (
            <p className="ref-intro">
              <Link href={`/pokedex/${data.species}`}>View in Pokédex</Link>
            </p>
          )}
          <p className="ref-intro">
            Rank #<span className="mono-num">{data.rank}</span> ·{" "}
            <span className="mono-num">{data.usagePct.toFixed(1)}%</span>{" "}
            usage · {formatMonthLabel(data.month)} · {data.label} ladder ·
            cutoff <span className="mono-num">{data.snapshot.cutoff}</span>+
            battles
          </p>
        </div>
      </div>

      <section className="ref-card ref-meta-card">
        <h2 className="ref-meta-card__title">Usage trend</h2>
        <MetaTrendSparkline
          points={data.trend.map((t) => ({
            month: t.month,
            value: t.usagePct,
          }))}
        />
      </section>

      <section className="ref-card ref-meta-card">
        <MetaUsageLists sections={usageSections(format, data)} />
      </section>

      <section className="ref-card ref-meta-card">
        <h2 className="ref-meta-card__title">Representative set</h2>
        <CopyShowdownSet exportText={data.showdownExport} />
      </section>

      <AskOakCta
        prompt={`What does ${data.displayName} run in ${data.label} and why?`}
      />
    </main>
  );
}
