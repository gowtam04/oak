/**
 * /moves/[slug] — a single move reference page: a fact table (type, damage
 * class, power, accuracy, PP, priority, target), effect prose, the full
 * "Pokémon that can learn it" reverse roster (the crawl spine), and an
 * "Ask Oak" CTA.
 *
 * Champions-only (CF-DEX-US-1): unknown slugs 404; no generation picker.
 *
 * Detail route config + dynamic-import + notFound rules: see /pokedex/[slug].
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import RefRosterList from "@/components/reference/RefRosterList";
import type {
  RefRosterEntry,
  RefRosterGroup,
} from "@/components/reference/RefRosterList";
import AskOakCta from "@/components/reference/AskOakCta";
import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { loadMovePage } = await import("@/data/reference-pages");
  const data = await loadMovePage(slug);
  if (!data) return {};
  return {
    title: buildMoveTitle(data),
    description: buildMoveDescription(data),
    alternates: { canonical: `/moves/${slug}` },
  };
}

export default async function MoveDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ format?: string | string[] }>;
}) {
  const { slug } = await params;
  const { loadMovePage } = await import("@/data/reference-pages");
  const data = await loadMovePage(slug);
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
    ...(data.flags && data.flags.length > 0
      ? [{ label: "Flags", value: data.flags.join(", ") }]
      : []),
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
        <h2 className="ref-detail-section__title">
          Pokémon that can learn {data.displayName} ({data.learnerCount})
        </h2>
        {data.learnerCount > 0 ? (
          <RefRosterList groups={learnerGroups(data.learners)} />
        ) : (
          <p className="ref-intro">
            No Pokémon on the Champions roster can learn {data.displayName}.
          </p>
        )}
      </section>

      <AskOakCta prompt={`Tell me about ${data.displayName}`} />
    </main>
  );
}
