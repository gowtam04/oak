/**
 * TeamAnalysisPanel — the collapsible "Team analysis" section of the team editor
 * (#9). Driven by the LIVE draft members + format: it debounces (~500ms) a call
 * to the stateless `POST /api/teams/analyze` endpoint (via the never-throwing
 * `fetchTeamAnalysis` helper), cancelling any in-flight request when the draft
 * changes (AbortController) and discarding stale responses (a generation guard).
 *
 * States, all keeping the last good content so the panel never flickers empty:
 *   - no species yet → a hint ("Add a Pokémon to see team coverage.");
 *   - loading        → a subtle indicator over the last good content;
 *   - error          → an inline notice + Retry, over the last good content;
 *   - ok             → the defensive matrix (shared weaknesses), offensive
 *                      coverage (covered / uncovered), and speed order.
 *
 * Rendering reuses `TypeBadge` for type chips and the design-system CSS vars; the
 * v1 caveat (`notes[]`) renders as a footnote. It reads ONLY the wire contract —
 * no db/repos — so it's safe under jsdom with the fetch helper mocked.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { fetchTeamAnalysis } from "@/lib/api/team-analysis-client";
import type {
  DefenseRow,
  TeamAnalysisOk,
} from "@/lib/teams/team-analysis";

/** Debounce before hitting the endpoint after the draft changes. */
const DEBOUNCE_MS = 500;

export interface TeamAnalysisPanelProps {
  members: TeamMember[];
  format: Format;
}

/** Map each analyzed member slug → its display name (found members only). */
function nameBySlug(analysis: TeamAnalysisOk): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of analysis.members) {
    if (m.found) map.set(m.slug, m.display_name);
  }
  return map;
}

/** Defense rows with at least one weak member, worst (most weak) first. */
function weaknessRows(defense: DefenseRow[]): DefenseRow[] {
  return defense
    .filter((row) => row.weak.length > 0)
    .sort((a, b) => b.weak.length - a.weak.length || a.type.localeCompare(b.type));
}

export default function TeamAnalysisPanel({
  members,
  format,
}: TeamAnalysisPanelProps) {
  const [open, setOpen] = useState(true);
  const [analysis, setAnalysis] = useState<TeamAnalysisOk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const genRef = useRef(0);

  const hasSpecies = members.some((m) => m.species);

  // A stable key over only the analysis-relevant fields, so cosmetic edits
  // (nickname, tera, IVs) don't trigger a refetch.
  const analysisKey = useMemo(
    () =>
      JSON.stringify(
        members.map((m) => ({
          s: m.species,
          mv: m.moves,
          n: m.nature,
          l: m.level,
          e: m.evs,
        })),
      ),
    [members],
  );

  useEffect(() => {
    if (!hasSpecies) {
      setAnalysis(null);
      setError(false);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void fetchTeamAnalysis(format, members, controller.signal).then(
        (result) => {
          if (gen !== genRef.current) return; // superseded — discard
          setLoading(false);
          if (!result || result.status !== "ok") {
            setError(true);
            return;
          }
          setError(false);
          setAnalysis(result);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // members is captured intentionally; analysisKey stands in for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey, format, retryNonce]);

  const names = analysis ? nameBySlug(analysis) : new Map<string, string>();
  const label = (slug: string) => names.get(slug) ?? slug;

  return (
    <section className="team-analysis" data-testid="team-analysis">
      <button
        type="button"
        className="team-analysis__toggle"
        data-testid="team-analysis-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="team-analysis__title">Team analysis</span>
        {loading && (
          <span
            className="team-analysis__spinner"
            data-testid="team-analysis-loading"
            aria-label="Analyzing team"
          />
        )}
        <span className="team-analysis__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="team-analysis__body">
          {!hasSpecies ? (
            <p className="team-analysis__hint" data-testid="team-analysis-hint">
              Add a Pokémon to see team coverage.
            </p>
          ) : (
            <>
              {error && (
                <div
                  className="team-analysis__error"
                  data-testid="team-analysis-error"
                  role="status"
                >
                  <span>Couldn&apos;t load team analysis.</span>
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost tm-btn--sm"
                    data-testid="team-analysis-retry"
                    onClick={() => setRetryNonce((n) => n + 1)}
                  >
                    Retry
                  </button>
                </div>
              )}

              {analysis ? (
                <div className="team-analysis__content">
                  {/* Defensive matrix — shared weaknesses. */}
                  <div
                    className="team-analysis__group"
                    data-testid="team-analysis-defense"
                  >
                    <h4 className="team-analysis__group-title ilabel">
                      Defensive weaknesses
                    </h4>
                    {weaknessRows(analysis.defense).length === 0 ? (
                      <p className="team-analysis__none">
                        No shared weaknesses — a well-balanced core.
                      </p>
                    ) : (
                      <ul className="team-analysis__rows">
                        {weaknessRows(analysis.defense).map((row) => (
                          <li
                            key={row.type}
                            className="team-analysis__row"
                            data-testid={`defense-${row.type}`}
                          >
                            <TypeBadge type={row.type as TypeName} />
                            <span
                              className="team-analysis__count mono-num"
                              data-count={row.weak.length}
                            >
                              ×{row.weak.length}
                            </span>
                            <span className="team-analysis__members">
                              {row.weak.map(label).join(", ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Offensive coverage — covered / uncovered. */}
                  <div
                    className="team-analysis__group"
                    data-testid="team-analysis-offense"
                  >
                    <h4 className="team-analysis__group-title ilabel">
                      Offensive coverage
                    </h4>
                    <div className="team-analysis__cov-line">
                      <span className="team-analysis__cov-label">Covered</span>
                      <span className="team-analysis__chips">
                        {analysis.offense.covered.length === 0 ? (
                          <span className="team-analysis__none">—</span>
                        ) : (
                          analysis.offense.covered.map((c) => (
                            <TypeBadge key={c.type} type={c.type as TypeName} />
                          ))
                        )}
                      </span>
                    </div>
                    <div className="team-analysis__cov-line">
                      <span className="team-analysis__cov-label">Uncovered</span>
                      <span
                        className="team-analysis__chips team-analysis__chips--warn"
                        data-testid="team-analysis-uncovered"
                      >
                        {analysis.offense.uncovered.length === 0 ? (
                          <span className="team-analysis__none">
                            None — full super-effective coverage.
                          </span>
                        ) : (
                          analysis.offense.uncovered.map((t) => (
                            <TypeBadge key={t} type={t as TypeName} />
                          ))
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Speed order. */}
                  <div
                    className="team-analysis__group"
                    data-testid="team-analysis-speed"
                  >
                    <h4 className="team-analysis__group-title ilabel">
                      Speed order
                    </h4>
                    {analysis.speed_tiers.length === 0 ? (
                      <p className="team-analysis__none">—</p>
                    ) : (
                      <ul className="team-analysis__speed">
                        {analysis.speed_tiers.map((tier) => (
                          <li
                            key={tier.member}
                            className="team-analysis__speed-row"
                          >
                            <span className="team-analysis__speed-name">
                              {label(tier.member)}
                            </span>
                            <span className="team-analysis__speed-val mono-num">
                              {tier.speed}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {analysis.notes.length > 0 && (
                    <p
                      className="team-analysis__caveat"
                      data-testid="team-analysis-caveat"
                    >
                      {analysis.notes.join(" ")}
                    </p>
                  )}
                </div>
              ) : (
                !error && (
                  <p className="team-analysis__hint">Analyzing team…</p>
                )
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
