/**
 * /meta/[format] — the competitive-ladder leaderboard: format tabs, a month
 * picker, a snapshot line (month, cutoff, total battles, source attribution),
 * and the ranked usage table. Every row links to its `/meta/<format>/<species>`
 * drill-in (B-5).
 *
 * Index route: `runtime = "nodejs"` + `dynamic = "force-dynamic"` — matches
 * `/pokedex`'s index page. The loader is dynamically imported INSIDE the page
 * and `generateMetadata` bodies so `next build` never evaluates `@/env`/`@/data/db`
 * at module scope (see CLAUDE.md's env-throw gotcha). Unlike the reference-pages
 * index routes, an unsynced ladder is NOT an error: `loadMetaLeaderboard`
 * returns `available: false` and this page renders an honest empty state
 * rather than throwing (see `src/data/meta-pages.ts`'s module doc for why the
 * meta ladder deliberately does not share reference-pages' `index_unavailable`
 * contract).
 *
 * `?month=` is read from `searchParams` and passed to the loader only when it
 * names a month the ladder actually has synced (`view.month` on the returned
 * view always reflects what was actually resolved); an unrecognized/omitted
 * month falls back to the latest synced month inside the loader itself.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import MetaFormatTabs from "@/components/meta/MetaFormatTabs";
import MetaMonthPicker from "@/components/meta/MetaMonthPicker";
import { formatMonthLabel } from "@/components/meta/month-label";
import MetaLeaderboardTable from "@/components/meta/MetaLeaderboardTable";
import { META_FORMATS, isMetaFormat, type MetaFormat } from "@/data/meta-formats";
import type { MetaLeaderboardView } from "@/lib/meta-pages-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The format-tabs row: every configured ladder, flagging the active one. */
function tabsFor(active: MetaFormat) {
  return META_FORMATS.map((f) => ({
    id: f.id,
    shortLabel: f.shortLabel,
    href: `/meta/${f.id}`,
    current: f.id === active,
  }));
}

async function loadView(
  format: MetaFormat,
  month: string | undefined,
): Promise<MetaLeaderboardView> {
  const { loadMetaLeaderboard } = await import("@/data/meta-pages");
  return loadMetaLeaderboard(format, month);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ format: string }>;
  searchParams: Promise<{ month?: string }>;
}): Promise<Metadata> {
  const { format } = await params;
  if (!isMetaFormat(format)) return {};
  const { month } = await searchParams;
  const view = await loadView(format, month);

  const monthLabel =
    view.available && month && view.month === month
      ? ` — ${formatMonthLabel(view.month)}`
      : "";

  return {
    title: `${view.label} usage stats${monthLabel}`,
    alternates: { canonical: `/meta/${format}` },
  };
}

export default async function MetaLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ format: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { format } = await params;
  if (!isMetaFormat(format)) notFound();
  const { month } = await searchParams;
  const view = await loadView(format, month);

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">{view.label}</h1>
      <MetaFormatTabs tabs={tabsFor(format)} />

      {!view.available ? (
        <p className="ref-intro">
          No metagame data synced yet for {view.label}.
        </p>
      ) : (
        <section className="ref-card ref-meta-card">
          <div className="ref-meta-card__header">
            <p className="ref-meta-snapshot">
              {formatMonthLabel(view.month)} · cutoff {view.snapshot.cutoff}+
              battles
              {view.snapshot.totalBattles != null &&
                ` · ${view.snapshot.totalBattles.toLocaleString()} total battles`}
              {" · "}
              Data:{" "}
              <a href={view.snapshot.sourceUrl}>Smogon usage statistics</a>
            </p>

            <MetaMonthPicker
              months={view.months}
              current={view.month}
              basePath={`/meta/${format}`}
            />
          </div>

          <MetaLeaderboardTable
            rows={view.rows.map((r) => ({
              rank: r.rank,
              name: r.displayName,
              href: `/meta/${format}/${r.species}`,
              usagePct: r.usagePct,
              deltaPct: r.deltaPct,
              species: r.species,
              spriteUrl: r.spriteUrl,
            }))}
          />
        </section>
      )}
    </main>
  );
}
