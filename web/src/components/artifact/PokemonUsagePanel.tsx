/**
 * Live Champions usage drill-in for a Pokémon artifact's Usage tab.
 * Same payload as `/usage/[slug]`: ladder, snapshot chrome, six share lists,
 * representative set, Apply. Nested names stay in the artifact stack.
 */

"use client";

import { useEffect, useState } from "react";

import CopyShowdownSet from "@/components/meta/CopyShowdownSet";
import ApplyUsageSet from "@/app/(reference)/usage/apply-usage-set";
import UsageFetchedAt from "@/app/(reference)/usage/usage-fetched-at";
import UsageSourceNote from "@/app/(reference)/usage/usage-source-note";
import { CHAMPIONS_REGULATION } from "@/data/formats";
import {
  fetchUsageSpecies,
  USAGE_UNAVAILABLE_COPY,
  usageShowdownExport,
  type UsageClientEntry,
  type UsageLadder,
  type UsageSpeciesClientResponse,
} from "@/lib/api/usage-client";

import EntityLink from "./EntityLink";
import type { EntityKind } from "./types";

export interface PokemonUsagePanelProps {
  slug: string;
}

function pctLabel(entry: UsageClientEntry): string {
  return entry.pct == null ? "—" : `${entry.pct.toFixed(1)}%`;
}

const LIST_KIND: Record<string, EntityKind | null> = {
  Moves: "move",
  Items: "item",
  Abilities: "ability",
  Natures: null,
  Spreads: null,
  Teammates: "pokemon",
};

function UsageList({
  title,
  entries,
}: {
  title: string;
  entries: UsageClientEntry[];
}) {
  if (entries.length === 0) return null;
  const kind = LIST_KIND[title] ?? null;
  return (
    <div className="pokemon-usage__group">
      <h4 className="pokemon-usage__group-title ilabel">{title}</h4>
      <ul className="pokemon-usage__list">
        {entries.map((entry) => (
          <li key={entry.name} className="pokemon-usage__item">
            {kind ? (
              <EntityLink
                kind={kind}
                q={entry.name}
                className="pokemon-usage__name"
              >
                {entry.name}
              </EntityLink>
            ) : (
              <span className="pokemon-usage__name">{entry.name}</span>
            )}
            <span className="pokemon-usage__pct mono-num">
              {pctLabel(entry)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FoundBody({
  view,
  ladder,
}: {
  view: Extract<UsageSpeciesClientResponse, { found: true }>;
  ladder: UsageLadder;
}) {
  const label = ladder === "singles" ? "Singles" : "Doubles";
  return (
    <>
      <p className="pokemon-usage__kicker">
        Live {label} usage
        {view.season ? ` · ${view.season}` : ""} · {CHAMPIONS_REGULATION}
      </p>
      {typeof view.fetched_at === "number" ? (
        <p className="pokemon-usage__fetched">
          <UsageFetchedAt ms={view.fetched_at} />
        </p>
      ) : null}

      <UsageList title="Moves" entries={view.moves} />
      <UsageList title="Items" entries={view.items} />
      <UsageList title="Abilities" entries={view.abilities} />
      <UsageList title="Natures" entries={view.natures} />
      <UsageList title="Spreads" entries={view.spreads} />
      <UsageList title="Teammates" entries={view.teammates} />

      {view.attribution ? (
        <UsageSourceNote attribution={view.attribution} />
      ) : null}

      <section className="pokemon-usage__set">
        <h4 className="pokemon-usage__group-title ilabel">
          Representative set
        </h4>
        <CopyShowdownSet
          exportText={usageShowdownExport(view.saved_name, view)}
        />
        <ApplyUsageSet species={view.slug} />
      </section>
    </>
  );
}

export default function PokemonUsagePanel({
  slug,
}: PokemonUsagePanelProps): React.JSX.Element {
  const [ladder, setLadder] = useState<UsageLadder>("doubles");
  const [view, setView] = useState<UsageSpeciesClientResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUsageSpecies(slug, ladder).then((next) => {
      if (cancelled) return;
      setView(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, ladder]);

  return (
    <div className="pokemon-usage" data-testid="pokemon-usage">
      <div
        className="pokemon-usage__ladders"
        role="group"
        aria-label="Usage ladder"
      >
        {(["doubles", "singles"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className="pokemon-usage__ladder"
            aria-pressed={ladder === id}
            data-testid={`pokemon-usage-ladder-${id}`}
            onClick={() => setLadder(id)}
          >
            {id === "doubles" ? "Doubles" : "Singles"}
          </button>
        ))}
      </div>

      {loading && !view ? (
        <p className="pokemon-usage__status" data-testid="pokemon-usage-loading">
          Loading live usage…
        </p>
      ) : !view || view.available === false ? (
        <p
          className="pokemon-usage__status"
          data-testid="pokemon-usage-unavailable"
        >
          {USAGE_UNAVAILABLE_COPY}
        </p>
      ) : view.found !== true ? (
        <p
          className="pokemon-usage__status"
          data-testid="pokemon-usage-not-found"
        >
          No Champions usage set is listed for this species
          {view.suggestions.length
            ? ` (try ${view.suggestions.slice(0, 3).join(", ")})`
            : ""}
          . It may not be on the Champions roster.
        </p>
      ) : (
        <FoundBody view={view} ladder={ladder} />
      )}
    </div>
  );
}
