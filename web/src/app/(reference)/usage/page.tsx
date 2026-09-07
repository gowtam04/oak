/**
 * /usage — live Pokémon Champions usage leaderboard (CF-USAGE-US-1, ADR-5).
 * Doubles default; Singles via `?ladder=singles`. Honest unavailable state.
 */

import type { Metadata } from "next";

import { CHAMPIONS_REGULATION } from "@/data/formats";
import { parseUsageLadder } from "@/server/champions-usage/ladder";
import type { UsageLeaderboardResponse } from "@/server/champions-usage/usage-gateway";
import { formatFetchedAt, ladderTabs, usageHref } from "./ladder-href";
import UsageLadderTabs from "./usage-ladder-tabs";
import UsageLeaderboardTable from "./usage-leaderboard-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE: Omit<UsageLeaderboardResponse, "ladder"> & {
  available: false;
} = {
  available: false,
  error: "upstream_unavailable",
  rows: [],
};

async function loadView(ladder: "doubles" | "singles"): Promise<UsageLeaderboardResponse> {
  try {
    const { db } = await import("@/data/db");
    const { loadUsageLeaderboard } = await import(
      "@/server/champions-usage/usage-gateway"
    );
    return await loadUsageLeaderboard(ladder, db);
  } catch {
    return { ...UNAVAILABLE, ladder };
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ladder?: string }>;
}): Promise<Metadata> {
  const ladder = parseUsageLadder((await searchParams).ladder) ?? "doubles";
  const label = ladder === "singles" ? "Singles" : "Doubles";
  return {
    title: `Usage — Pokémon Champions ${label}`,
    description: `Live Pokémon Champions ${label} usage for ${CHAMPIONS_REGULATION}. Ranked ladder from community data, Doubles by default.`,
    alternates: { canonical: usageHref(undefined, ladder) },
  };
}

export default async function UsageIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ ladder?: string }>;
}) {
  const parsed = parseUsageLadder((await searchParams).ladder);
  const ladder = parsed ?? "doubles";
  const view = await loadView(ladder);
  const label = ladder === "singles" ? "Singles" : "Doubles";

  return (
    <main className="ref-page">
      <h1 className="ref-hero__title">Usage</h1>
      <p className="ref-intro">
        Live Pokémon Champions usage ({CHAMPIONS_REGULATION}). Doubles is the
        official ladder; Singles is a second view. Figures are a snapshot, not
        a guarantee of the next hour.
      </p>
      <UsageLadderTabs tabs={ladderTabs(ladder)} />

      {!view.available ? (
        <p className="ref-intro" data-testid="usage-unavailable">
          Live Champions usage is unavailable right now. Chat, Dex, Teams, and
          Calc still work — try this page again in a bit.
        </p>
      ) : (
        <section className="ref-card ref-meta-card">
          <div className="ref-meta-card__header">
            <p className="ref-meta-snapshot">
              Live {label} · {view.season} · fetched {formatFetchedAt(view.fetched_at)}{" "}
              · {view.attribution}
            </p>
          </div>
          {view.rows.length === 0 ? (
            <p className="ref-intro">No Champions usage rows for this ladder.</p>
          ) : (
            <UsageLeaderboardTable
              rows={view.rows.map((r) => ({
                rank: r.rank,
                name: r.name,
                href: usageHref(r.slug, ladder),
                usagePct: r.usage_pct,
                species: r.slug,
                spriteUrl: r.sprite ?? null,
              }))}
            />
          )}
        </section>
      )}
    </main>
  );
}
