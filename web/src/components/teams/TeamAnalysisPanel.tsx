/**
 * TeamAnalysisPanel — collapsible team analysis for the editor.
 * Driven by live draft members + format via debounced POST /api/teams/analyze.
 *
 * Renders: roles, phys/spec, defensive weaknesses, offense, speed, meta threats,
 * and residual notes. Optional onAnalysisChange for assistant suggestion chips.
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
  ThreatRowWire,
} from "@/lib/teams/team-analysis";
import { ROLE_LABELS, type RoleFlag } from "@/lib/teams/role-inventory";

/** Debounce before hitting the endpoint after the draft changes. */
const DEBOUNCE_MS = 500;

export interface TeamAnalysisPanelProps {
  members: TeamMember[];
  format: Format;
  /** Fires when analysis settles (ok) or clears — for assistant chips. */
  onAnalysisChange?: (analysis: TeamAnalysisOk | null) => void;
}

function nameBySlug(analysis: TeamAnalysisOk): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of analysis.members) {
    if (m.found) map.set(m.slug, m.display_name);
  }
  return map;
}

function weaknessRows(defense: DefenseRow[]): DefenseRow[] {
  return defense
    .filter((row) => row.weak.length > 0)
    .sort((a, b) => b.weak.length - a.weak.length || a.type.localeCompare(b.type));
}

function roleLabel(flag: string): string {
  return ROLE_LABELS[flag as RoleFlag] ?? flag.replace(/_/g, " ");
}

function threatClass(status: ThreatRowWire["status"]): string {
  if (status === "answered") return "team-analysis__threat--answered";
  if (status === "soft") return "team-analysis__threat--soft";
  return "team-analysis__threat--unanswered";
}

export default function TeamAnalysisPanel({
  members,
  format,
  onAnalysisChange,
}: TeamAnalysisPanelProps) {
  const [open, setOpen] = useState(true);
  const [analysis, setAnalysis] = useState<TeamAnalysisOk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const genRef = useRef(0);
  const onAnalysisRef = useRef(onAnalysisChange);
  onAnalysisRef.current = onAnalysisChange;

  const hasSpecies = members.some((m) => m.species);

  // Include ability/item so ability-aware defense refetches.
  const analysisKey = useMemo(
    () =>
      JSON.stringify(
        members.map((m) => ({
          s: m.species,
          a: m.ability,
          i: m.item,
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
      onAnalysisRef.current?.(null);
      return;
    }
    const gen = ++genRef.current;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void fetchTeamAnalysis(format, members, controller.signal).then(
        (result) => {
          if (gen !== genRef.current) return;
          setLoading(false);
          if (!result || result.status !== "ok") {
            setError(true);
            return;
          }
          setError(false);
          setAnalysis(result);
          onAnalysisRef.current?.(result);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
                  {/* Roles & tools */}
                  <div
                    className="team-analysis__group"
                    data-testid="team-analysis-roles"
                  >
                    <h4 className="team-analysis__group-title ilabel">
                      Roles &amp; tools
                    </h4>
                    <div className="team-analysis__role-row">
                      <span className="team-analysis__cov-label">Present</span>
                      <span className="team-analysis__chips">
                        {analysis.roles_present.length === 0 ? (
                          <span className="team-analysis__none">—</span>
                        ) : (
                          analysis.roles_present.map((f) => (
                            <span
                              key={f}
                              className="team-analysis__role-chip team-analysis__role-chip--ok"
                            >
                              {roleLabel(f)}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                    {analysis.roles_missing.length > 0 && (
                      <div className="team-analysis__role-row">
                        <span className="team-analysis__cov-label">Gaps</span>
                        <span className="team-analysis__chips team-analysis__chips--warn">
                          {analysis.roles_missing.map((f) => (
                            <span
                              key={f}
                              className="team-analysis__role-chip team-analysis__role-chip--miss"
                            >
                              {roleLabel(f)}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    <p className="team-analysis__physpec" data-testid="team-analysis-physpec">
                      Moves: {analysis.physical_special.physical_moves} physical ·{" "}
                      {analysis.physical_special.special_moves} special ·{" "}
                      {analysis.physical_special.status_moves} status
                      {analysis.physical_special.attacker_bias !== "none" &&
                        ` · bias ${analysis.physical_special.attacker_bias}`}
                    </p>
                  </div>

                  {/* Defensive matrix */}
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
                    {analysis.defense_notes.length > 0 && (
                      <ul
                        className="team-analysis__defense-notes"
                        data-testid="team-analysis-defense-notes"
                      >
                        {analysis.defense_notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Offensive coverage */}
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

                  {/* Speed order */}
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

                  {/* Meta threats */}
                  {(analysis.threats.length > 0 || analysis.meta_attribution) && (
                    <div
                      className="team-analysis__group"
                      data-testid="team-analysis-threats"
                    >
                      <h4 className="team-analysis__group-title ilabel">
                        Meta threats
                      </h4>
                      {analysis.meta_attribution && (
                        <p className="team-analysis__meta-attr">
                          {analysis.meta_attribution}
                        </p>
                      )}
                      {analysis.threats.length === 0 ? (
                        <p className="team-analysis__none">No ladder threats loaded.</p>
                      ) : (
                        <ul className="team-analysis__threats">
                          {analysis.threats.map((t) => (
                            <li
                              key={t.species}
                              className={`team-analysis__threat ${threatClass(t.status)}`}
                              data-testid={`threat-${t.species}`}
                            >
                              <span className="team-analysis__threat-name">
                                {t.display_name}
                                {t.rank != null && (
                                  <span className="team-analysis__threat-rank mono-num">
                                    {" "}
                                    #{t.rank}
                                  </span>
                                )}
                              </span>
                              <span className="team-analysis__threat-status">
                                {t.status}
                              </span>
                              <span className="team-analysis__threat-reasons">
                                {t.reasons.join("; ")}
                              </span>
                              {t.sample_calcs && t.sample_calcs.length > 0 && (
                                <ul className="team-analysis__calcs">
                                  {t.sample_calcs.map((c) => (
                                    <li key={`${c.defender}-${c.move}`}>
                                      {c.move} → {label(c.defender)}:{" "}
                                      {c.min_pct}–{c.max_pct}%
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

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
