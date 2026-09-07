/**
 * /pokedex/[slug] — a single Pokémon reference page: hero, generated intro,
 * base-stat table, defensive matchups, abilities, evolution line, full
 * learnset, best-effort live Champions usage, and an "Ask Oak" CTA.
 *
 * Champions-only (CF-DEX-US-1): unknown slugs 404; there is no generation
 * picker and no other-game fallback.
 *
 * Detail route: `runtime = "nodejs"` + `revalidate = 86400`, NO
 * `generateStaticParams` — nothing prerenders at build (so `@/env`/`@/data/db`
 * are never evaluated at build time); the first request renders and ISR-caches
 * for 24h. The loader is dynamically imported INSIDE both the page and
 * `generateMetadata` (React `cache()` dedupes the two into one query). An
 * unknown slug → `notFound()`; an unbuilt index throws (→ 500).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import StatsTable from "@/components/reference/StatsTable";
import MatchupChart from "@/components/reference/MatchupChart";
import type { MatchupGroup } from "@/components/reference/MatchupChart";
import AbilityBlock from "@/components/reference/AbilityBlock";
import EvolutionChain from "@/components/reference/EvolutionChain";
import type { EvolutionEdge as EvolutionEdgeView } from "@/components/reference/EvolutionChain";
import LearnsetTable from "@/components/reference/LearnsetTable";
import UsageBlock from "@/components/reference/UsageBlock";
import type { UsageListEntry } from "@/components/reference/UsageBlock";
import AskOakCta from "@/components/reference/AskOakCta";
import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import {
  buildPokemonDescription,
  buildPokemonTitle,
} from "@/data/reference-metadata";
import type {
  EvolutionEdge,
  PokemonPageData,
  UsageStatEntry,
} from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const revalidate = 86400;

/** Title-case a slug ("rough-skin" → "Rough Skin"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The six base stats as StatsTable rows (label + key + value). */
function statRows(data: PokemonPageData) {
  const s = data.stats;
  return [
    { label: "HP", key: "hp", value: s.hp },
    { label: "Attack", key: "atk", value: s.atk },
    { label: "Defense", key: "def", value: s.def },
    { label: "Sp. Atk", key: "spa", value: s.spa },
    { label: "Sp. Def", key: "spd", value: s.spd },
    { label: "Speed", key: "spe", value: s.spe },
  ];
}

/**
 * The defensive matchups as MatchupChart groups in the fixed 4x → 0x order.
 * `weak_to`/`resists` already INCLUDE their quad subsets, so the 2x/0.5x
 * buckets subtract them out. Labels embed the multiplier so each is unique
 * (the component keys rows by label). Empty buckets are dropped by the chart.
 */
function matchupGroups(data: PokemonPageData): MatchupGroup[] {
  const m = data.matchups;
  const not = (set: string[]) => (t: string) => !set.includes(t);
  return [
    { label: "Weak to (4x)", multiplier: "4x", types: m.quad_weak_to },
    {
      label: "Weak to (2x)",
      multiplier: "2x",
      types: m.weak_to.filter(not(m.quad_weak_to)),
    },
    {
      label: "Resists (0.5x)",
      multiplier: "0.5x",
      types: m.resists.filter(not(m.quad_resists)),
    },
    { label: "Resists (0.25x)", multiplier: "0.25x", types: m.quad_resists },
    { label: "Immune to", multiplier: "0x", types: m.immune_to },
  ];
}

/** Condense a raw evolution condition list into a short human string. */
function condenseConditions(
  conditions: EvolutionEdge["conditions"],
): string | null {
  const parts: string[] = [];
  for (const c of conditions) {
    const r = c as Record<string, unknown>;
    if (typeof r.min_level === "number") parts.push(`Level ${r.min_level}`);
    else if (typeof r.item === "string") parts.push(`Use ${titleCase(r.item)}`);
    else if (typeof r.held_item === "string")
      parts.push(`Hold ${titleCase(r.held_item)}`);
    else if (typeof r.min_happiness === "number") parts.push("High friendship");
    else if (typeof r.known_move === "string")
      parts.push(`Knowing ${titleCase(r.known_move)}`);
    else if (typeof r.trigger === "string" && r.trigger !== "level-up")
      parts.push(titleCase(r.trigger));
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Assembler evolution edges → the EvolutionChain component's view shape. */
function evolutionEdges(edges: EvolutionEdge[]): EvolutionEdgeView[] {
  return edges.map((e) => ({
    fromSlug: e.from,
    fromName: titleCase(e.from),
    toSlug: e.to,
    toName: titleCase(e.to),
    condition: condenseConditions(e.conditions),
  }));
}

/** UsageBlock lists want a non-null pct — drop entries the source didn't rate. */
function usageEntries(entries: UsageStatEntry[]): UsageListEntry[] {
  return entries
    .filter((e): e is { name: string; pct: number } => e.pct != null)
    .map((e) => ({ name: e.name, pct: e.pct }));
}

/**
 * A deterministic intro paragraph generated from the profile data (types, BST,
 * the standout base stat, abilities) — crawlable prose unique per species
 * without any model call.
 */
function pokemonIntro(data: PokemonPageData): string {
  const types = data.types.map(titleCase).join("/");
  const rows = statRows(data);
  const top = rows.reduce((best, r) => (r.value > best.value ? r : best), rows[0]!);
  const abilityNames = data.abilities.map((a) =>
    a.isHidden ? `${a.displayName} (hidden)` : a.displayName,
  );
  const abilityLine =
    abilityNames.length > 0
      ? ` Its abilit${abilityNames.length > 1 ? "ies are" : "y is"} ${abilityNames.join(", ")}.`
      : "";
  return (
    `${data.displayName} is a ${types}-type Pokémon with a base stat total of ` +
    `${data.baseStatTotal}, strongest in its ${top.label} (${top.value}).` +
    abilityLine +
    ` It is on the current Champions roster.`
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { loadPokemonPage } = await import("@/data/reference-pages");
  const data = await loadPokemonPage(slug);
  if (!data) return {};

  return {
    title: buildPokemonTitle(data),
    description: buildPokemonDescription(data),
    alternates: { canonical: `/pokedex/${slug}` },
    ...(data.artworkUrl
      ? { openGraph: { images: [data.artworkUrl] } }
      : {}),
  };
}

export default async function PokemonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const { loadPokemonPage } = await import("@/data/reference-pages");
  const data = await loadPokemonPage(slug);
  if (!data) notFound();

  const otherForms = data.forms.filter((f) => f !== data.slug);

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/pokedex">Pokédex</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span>{data.displayName}</span>
      </nav>

      <div className="ref-card ref-detail-hero" data-type={data.types[0]}>
        {data.artworkUrl && (
          <div className="ref-detail-hero__art-well">
            {/* eslint-disable-next-line @next/next/no-img-element -- external sprite host, not a bundled asset; a plain lazy <img> is intended here */}
            <img
              className="ref-detail-hero__art"
              src={data.artworkUrl}
              alt={`${data.displayName} official artwork`}
              loading="lazy"
              width={128}
              height={128}
            />
          </div>
        )}
        <div className="ref-detail-hero__meta">
          <span className="ref-detail-hero__dex mono-num">
            #{data.dexNumber}
          </span>
          <h1 className="ref-detail-hero__title">{data.displayName}</h1>
          <div className="ref-detail-hero__badges">
            {data.types.map((t) => (
              <TypeBadge key={t} type={t as TypeName} />
            ))}
          </div>
        </div>
      </div>

      <p className="ref-intro ref-detail-intro">{pokemonIntro(data)}</p>

      <section
        className="ref-card ref-detail-section"
        data-type={data.types[0]}
      >
        <h2 className="ref-detail-section__title">Base stats</h2>
        <StatsTable stats={statRows(data)} total={data.baseStatTotal} />
      </section>

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">Type matchups</h2>
        <MatchupChart groups={matchupGroups(data)} />
      </section>

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">Abilities</h2>
        <AbilityBlock abilities={data.abilities} />
      </section>

      {data.evolution && data.evolution.length > 0 && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Evolution</h2>
          <EvolutionChain edges={evolutionEdges(data.evolution)} />
        </section>
      )}

      {data.movepool.length > 0 && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Learnset</h2>
          <LearnsetTable groups={data.movepool} />
        </section>
      )}

      {data.usage && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Champions usage</h2>
          <UsageBlock
            slug={data.slug}
            usage={{
              season: data.usage.season,
              topMoves: usageEntries(data.usage.topMoves),
              topItems: usageEntries(data.usage.topItems),
              topTeammates: usageEntries(data.usage.topTeammates),
              attribution: data.usage.attribution,
            }}
          />
        </section>
      )}

      {otherForms.length > 0 && (
        <section className="ref-card ref-detail-section">
          <h2 className="ref-detail-section__title">Other forms</h2>
          <ul className="ref-formats">
            {otherForms.map((f) => (
              <li key={f} className="ref-formats__chip">
                <a href={`/pokedex/${f}`}>{titleCase(f)}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AskOakCta prompt={`Tell me about ${data.displayName}`} />
    </main>
  );
}
