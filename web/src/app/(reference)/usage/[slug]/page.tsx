/**
 * /usage/[slug] — live Champions usage drill-in (CF-USAGE-AC-1.4).
 */

import type { Metadata } from "next";
import Link from "next/link";

import AskOakCta from "@/components/reference/AskOakCta";
import MetaUsageLists from "@/components/meta/MetaUsageLists";
import type { MetaUsageSection } from "@/components/meta/MetaUsageLists";
import CopyShowdownSet from "@/components/meta/CopyShowdownSet";
import { CHAMPIONS_REGULATION } from "@/data/formats";
import { parseUsageLadder, toEntitySlug } from "@/server/champions-usage/ladder";
import type { UsageSpeciesResponse } from "@/server/champions-usage/usage-gateway";
import type { UsageEntry } from "@/agent/schemas";
import { ladderTabs, usageHref } from "../ladder-href";
import UsageFetchedAt from "../usage-fetched-at";
import UsageLadderTabs from "../usage-ladder-tabs";
import UsageSourceNote from "../usage-source-note";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pctLabel(entry: UsageEntry): string {
  return entry.pct == null ? "—" : `${entry.pct.toFixed(1)}%`;
}

function entryHref(
  kind: "move" | "item" | "ability" | "usage",
  name: string,
  ladder: "doubles" | "singles",
): string | null {
  const slug = toEntitySlug(name);
  if (!slug) return null;
  if (kind === "move") return `/moves/${slug}`;
  if (kind === "item") return `/items/${slug}`;
  if (kind === "ability") return `/abilities/${slug}`;
  return usageHref(slug, ladder);
}

function usageSections(
  data: {
    moves: UsageEntry[];
    items: UsageEntry[];
    abilities: UsageEntry[];
    natures: UsageEntry[];
    spreads: UsageEntry[];
    teammates: UsageEntry[];
  },
  ladder: "doubles" | "singles",
): MetaUsageSection[] {
  return [
    {
      title: "Moves",
      entries: data.moves.map((m) => ({
        name: m.name,
        href: entryHref("move", m.name, ladder),
        valueLabel: pctLabel(m),
      })),
    },
    {
      title: "Items",
      entries: data.items.map((i) => ({
        name: i.name,
        href: entryHref("item", i.name, ladder),
        valueLabel: pctLabel(i),
      })),
    },
    {
      title: "Abilities",
      entries: data.abilities.map((a) => ({
        name: a.name,
        href: entryHref("ability", a.name, ladder),
        valueLabel: pctLabel(a),
      })),
    },
    {
      title: "Natures",
      entries: data.natures.map((n) => ({
        name: n.name,
        href: null,
        valueLabel: pctLabel(n),
      })),
    },
    {
      title: "Spreads",
      entries: data.spreads.map((s) => ({
        name: s.name,
        href: null,
        valueLabel: pctLabel(s),
      })),
    },
    {
      title: "Teammates",
      entries: data.teammates.map((t) => ({
        name: t.name,
        href: entryHref("usage", t.name, ladder),
        valueLabel: pctLabel(t),
      })),
    },
  ];
}

function showdownExport(
  displayName: string,
  data: {
    items: UsageEntry[];
    abilities: UsageEntry[];
    natures: UsageEntry[];
    spreads: UsageEntry[];
    moves: UsageEntry[];
  },
): string {
  const item = data.items[0]?.name;
  const lines: string[] = [item ? `${displayName} @ ${item}` : displayName];
  const ability = data.abilities[0]?.name;
  if (ability) lines.push(`Ability: ${ability}`);
  const spread = data.spreads[0]?.name;
  if (spread) lines.push(`EVs: ${spread}`);
  const nature = data.natures[0]?.name;
  if (nature) lines.push(`${nature} Nature`);
  for (const move of data.moves.slice(0, 4)) {
    lines.push(`- ${move.name}`);
  }
  return lines.join("\n");
}

async function loadView(
  slug: string,
  ladder: "doubles" | "singles",
): Promise<UsageSpeciesResponse> {
  try {
    const { db } = await import("@/data/db");
    const { loadUsageSpecies } = await import(
      "@/server/champions-usage/usage-gateway"
    );
    return await loadUsageSpecies(slug, ladder, db);
  } catch {
    return { available: false, error: "upstream_unavailable" };
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ladder?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ladder = parseUsageLadder((await searchParams).ladder) ?? "doubles";
  const view = await loadView(slug, ladder);
  if (view.available && view.found) {
    return {
      title: `${view.saved_name} — Champions ${ladder === "singles" ? "Singles" : "Doubles"} usage`,
      alternates: { canonical: usageHref(slug, ladder) },
    };
  }
  return { title: "Usage", alternates: { canonical: usageHref(slug, ladder) } };
}

export default async function UsageSpeciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ladder?: string }>;
}) {
  const { slug } = await params;
  const ladder = parseUsageLadder((await searchParams).ladder) ?? "doubles";
  const view = await loadView(slug, ladder);
  const label = ladder === "singles" ? "Singles" : "Doubles";

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/usage">Usage</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span>{slug}</span>
      </nav>

      <UsageLadderTabs tabs={ladderTabs(ladder, slug)} />

      {!view.available ? (
        <p className="ref-intro" data-testid="usage-unavailable">
          Live Champions usage is unavailable right now. Chat, Dex, Teams, and
          Calc still work — try this page again in a bit.
        </p>
      ) : !view.found ? (
        <p className="ref-intro" data-testid="usage-not-found">
          No Champions usage set is listed for this species
          {view.suggestions.length
            ? ` (try ${view.suggestions.slice(0, 3).join(", ")})`
            : ""}
          . It may not be on the Champions roster.
        </p>
      ) : (
        <>
          <div className="ref-hero">
            <div>
              <h1 className="ref-hero__title">{view.saved_name}</h1>
              <p className="ref-intro">
                <Link href={`/pokedex/${view.slug}`}>View in Pokédex</Link>
              </p>
              <p className="ref-intro">
                Live {label} usage · {view.season} · {CHAMPIONS_REGULATION}
              </p>
              <p className="ref-meta-fetched">
                <UsageFetchedAt ms={view.fetched_at} />
              </p>
            </div>
          </div>

          <section className="ref-card ref-meta-card">
            <MetaUsageLists sections={usageSections(view, ladder)} />
            {view.attribution ? (
              <UsageSourceNote attribution={view.attribution} />
            ) : null}
          </section>

          <section className="ref-card ref-meta-card">
            <h2 className="ref-meta-card__title">Representative set</h2>
            <CopyShowdownSet
              exportText={showdownExport(view.saved_name, view)}
            />
          </section>

          <AskOakCta
            prompt={`What does ${view.saved_name} run in Champions ${label} right now?`}
          />
        </>
      )}
    </main>
  );
}
