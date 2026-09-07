/**
 * Compact calculator sheet over the current conversation (CALC-US-2/3).
 * Explain sends a chat message and does not dismiss (CALC-AC-8.2).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import type { CalcScenario } from "@/lib/calc/calc-schema";

import CalculatorPanel from "./CalculatorPanel";

export interface CalculatorOverlayProps {
  open: boolean;
  /** Ignored — calc is always Champions. Kept so chat callers compile. */
  format?: Format;
  slashRest?: string;
  scenario?: CalcScenario;
  onSend?: (message: string) => void;
  onExplain?: (message: string) => void;
  onDismiss?: () => void;
  onExpand?: (scenario: CalcScenario) => void;
}

function parseSlashRest(rest: string): CalcScenario {
  const format = CHAMPIONS_FORMAT;
  const empty: CalcScenario = { format, attacker: {}, defender: {}, move: {} };
  const trimmed = rest.trim();
  if (!trimmed) return empty;

  const vs = trimmed.split(/\s+vs\.?\s+/i);
  if (vs.length >= 2) {
    const left = vs[0]!.trim().split(/\s+/).filter(Boolean);
    const defender = vs[1]!.trim().split(/\s+/)[0] ?? "";
    if (left.length >= 2) {
      const species = left[0]!;
      const move = left.slice(1).join("-");
      return {
        format,
        attacker: { species },
        defender: defender ? { species: defender } : {},
        move: { slug: move, name: move },
      };
    }
    return {
      format,
      attacker: left[0] ? { species: left[0] } : {},
      defender: defender ? { species: defender } : {},
      move: {},
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return {
    format,
    attacker: tokens[0] ? { species: tokens[0] } : {},
    defender: {},
    move: {},
  };
}

export default function CalculatorOverlay({
  open,
  slashRest = "",
  scenario,
  onExplain,
  onDismiss,
  onExpand,
}: CalculatorOverlayProps) {
  const fromSlash = useMemo(() => parseSlashRest(slashRest), [slashRest]);
  const initial = scenario
    ? { ...scenario, format: CHAMPIONS_FORMAT }
    : fromSlash;
  const [live, setLive] = useState<CalcScenario>(initial);

  useEffect(() => {
    setLive(
      scenario
        ? { ...scenario, format: CHAMPIONS_FORMAT }
        : parseSlashRest(slashRest),
    );
  }, [scenario, slashRest]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  const handleExplain = useCallback(
    (message: string) => {
      onExplain?.(message);
    },
    [onExplain],
  );

  if (!open) return null;

  return (
    <div
      className="calculator-overlay"
      data-testid="calculator-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Calculator"
    >
      <div className="calculator-overlay__sheet">
        <header className="calculator-overlay__header">
          <h2 className="calculator-overlay__title">Calculator</h2>
          <div className="calculator-actions">
            <button
              type="button"
              className="calculator-btn"
              onClick={() => onExpand?.(live)}
            >
              Expand
            </button>
            <button
              type="button"
              className="calculator-btn"
              aria-label="Close"
              onClick={() => onDismiss?.()}
            >
              Close
            </button>
          </div>
        </header>
        <CalculatorPanel
          format={CHAMPIONS_FORMAT}
          scenario={live}
          onScenarioChange={setLive}
          onExplain={handleExplain}
        />
      </div>
    </div>
  );
}
