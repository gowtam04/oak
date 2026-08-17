/**
 * /moves/[slug] — a single move reference page: a fact table (type, damage
 * class, power, accuracy, PP, priority, target), effect prose, availability
 * chips, the full "Pokémon that can learn it" reverse roster (the crawl spine),
 * and an "Ask Oak" CTA.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 *
 * `?format=<Format>` selects which scope's profile is shown (shareable). An
 * invalid or unavailable format soft-falls back to the default SV-first chain.
 * Canonical SEO URL stays `/moves/{slug}` without the query.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import RefRosterList from "@/components/reference/RefRosterList";
import type {
  RefRosterEntry,
  RefRosterGroup,
} from "@/components/reference/RefRosterList";
import FormatChips from "@/components/reference/FormatChips";
import AskOakCta from "@/components/reference/AskOakCta";
import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import { isFormat, type Format } from "@/data/formats";
import { buildMoveDescription, buildMoveTitle } from "@/data/reference-metadata";
import type { LearnerRow } from "@/lib/reference-pages-types";

export const runtime = "nodejs";
export const revalidate = 86400;

/** Title-case a slug or short token ("tm-hm" → "Tm Hm", "physical" → "Physical"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Human label for a learn method (null = ingest left it unset). */
function methodLabel(method: string | null): string {
  switch (method) {
    case "level-up":
      return "Level-up";
    case "machine":
      return "TM/HM";
    case "tutor":
      return "Tutor";
    case "egg":
      return "Egg move";
    default:
      return method ? titleCase(method) : "Other";
  }
}

/** Group the reverse-learner roster by method into index groups. */
function learnerGroups(learners: LearnerRow[]): RefRosterGroup[] {
  const byMethod = new Map<string, RefRosterEntry[]>();
  for (const l of learners) {
    const heading = methodLabel(l.method);
    const entry: RefRosterEntry = {
      href: `/pokedex/${l.slug}`,
      primary: l.displayName,
    };
    const list = byMethod.get(heading);
    if (list) list.push(entry);
    else byMethod.set(heading, [entry]);
  }
  for (const entries of byMethod.values())
    entries.sort((a, b) => a.primary.localeCompare(b.primary));
  return [...byMethod.keys()]
    .sort()
    .map((heading) => ({ heading, entries: byMethod.get(heading)! }));
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
  const { loadMovePage } = await import("@/data/reference-pages");
  const data = await loadMovePage(slug, preferred);
  if (!data) return {};
  return {
    title: buildMoveTitle(data),
    description: buildMoveDescription(data),
    alternates: { canonical: `/moves/${slug}` },
  };
}

export default async function MoveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const preferred = parseFormatParam((await searchParams).format);
  const { loadMovePage } = await import("@/data/reference-pages");
  const data = await loadMovePage(slug, preferred);
  if (!data) notFound();

  const facts: { label: string; value: string }[] = [
    { label: "Type", value: titleCase(data.type) },
    { label: "Damage class", value: titleCase(data.damageClass) },
    { label: "Power", value: data.power == null ? "—" : String(data.power) },
    {
      label: "Accuracy",
      value: data.accuracy == null ? "—" : `${data.accuracy}%`,
    },
    { label: "PP", value: data.pp == null ? "—" : String(data.pp) },
    { label: "Priority", value: String(data.priority) },
    { label: "Target", value: titleCase(data.target) },
  ];
  const effect = data.effectFull || data.effectShort;

  return (
    <main className="ref-page">
      <nav className="ref-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/moves">Moves</Link>
        <span className="ref-breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span>{data.displayName}</span>
      </nav>

      <div className="ref-card ref-detail-hero" data-type={data.type}>
        <div className="ref-detail-hero__meta">
          <h1 className="ref-detail-hero__title">{data.displayName}</h1>
          <div className="ref-detail-hero__badges">
            <TypeBadge type={data.type as TypeName} />
          </div>
        </div>
      </div>

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">Details</h2>
        <table className="ref-fact-table">
          <tbody>
            {facts.map((f) => (
              <tr key={f.label}>
                <th scope="row">{f.label}</th>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
          hrefFor={(f) => `/moves/${slug}?format=${f}`}
        />
      </section>

      <section className="ref-card ref-detail-section">
        <h2 className="ref-detail-section__title">
          Pokémon that can learn {data.displayName} ({data.learnerCount})
        </h2>
        {data.learnerCount > 0 ? (
          <RefRosterList groups={learnerGroups(data.learners)} />
        ) : (
          <p className="ref-intro">
            No Pokémon in this scope can learn {data.displayName}.
          </p>
        )}
      </section>

      <AskOakCta prompt={`Tell me about ${data.displayName}`} />
    </main>
  );
}
