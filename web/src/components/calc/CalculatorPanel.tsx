/**
 * Shared calculator form (overlay + /calc). Posts to POST /api/calc;
 * never starts a chat turn (CALC-BR-1). Champions-only: Level 50, Stat
 * Points, hidden 31 individual values, roster species (CF-CALC-US-1,
 * CF-UI-US-8).
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import { postCalc } from "@/lib/api/calc-client";
import { explainCalcPrompt } from "@/lib/calc/explain-prompt";
import type {
  CalcField,
  CalcResult,
  CalcScenario,
  CalcSide,
} from "@/lib/calc/calc-schema";
import EntityPicker from "@/components/teams/EntityPicker";
import { NATURE_OPTIONS } from "@/components/teams/dex-constants";

import "./calculator.css";

const WEATHERS = ["none", "sun", "rain", "sand", "snow"] as const;

const SP_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

const CHAMPIONS_LEVEL = 50;
const SP_PER_STAT = 32;
const SP_BUDGET = 66;

const FIXED_IVS = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31,
} as const;

export interface CalculatorPanelProps {
  /** Ignored — calc is always Champions. Kept so overlay/chat callers compile. */
  format?: Format;
  scenario?: CalcScenario;
  onScenarioChange?: (scenario: CalcScenario) => void;
  onExplain?: (message: string) => void;
}

function emptyScenario(): CalcScenario {
  return {
    format: CHAMPIONS_FORMAT,
    attacker: { level: CHAMPIONS_LEVEL, ivs: { ...FIXED_IVS }, tera: null },
    defender: { level: CHAMPIONS_LEVEL, ivs: { ...FIXED_IVS }, tera: null },
    move: {},
  };
}

function bindSide(side: CalcSide | undefined): CalcSide {
  return {
    ...side,
    level: CHAMPIONS_LEVEL,
    ivs: { ...FIXED_IVS },
    tera: null,
  };
}

function championsScenario(scenario: CalcScenario | undefined): CalcScenario {
  if (!scenario) return emptyScenario();
  return {
    ...scenario,
    format: CHAMPIONS_FORMAT,
    attacker: bindSide(scenario.attacker),
    defender: bindSide(scenario.defender),
  };
}

function sideSpecies(side: CalcSide): string {
  return side.species ?? "";
}

function spTotal(side: CalcSide): number {
  const evs = side.evs ?? {};
  return SP_KEYS.reduce(
    (sum, key) => sum + (typeof evs[key] === "number" ? evs[key]! : 0),
    0,
  );
}

export default function CalculatorPanel({
  scenario,
  onScenarioChange,
  onExplain,
}: CalculatorPanelProps) {
  const [draft, setDraft] = useState<CalcScenario>(() =>
    championsScenario(scenario),
  );
  const [result, setResult] = useState<CalcResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void postCalc(draft).then((next) => {
        if (!cancelled) setResult(next);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [draft]);

  function patch(next: CalcScenario) {
    const bound = championsScenario(next);
    setDraft(bound);
    onScenarioChange?.(bound);
  }

  function patchSide(which: "attacker" | "defender", patchSide: Partial<CalcSide>) {
    patch({
      ...draft,
      [which]: { ...draft[which], ...patchSide },
    });
  }

  function patchField(field: Partial<CalcField>) {
    patch({
      ...draft,
      field: { ...draft.field, ...field },
    });
  }

  const ok = result?.ok === true;
  const estimate = ok ? result.estimate : null;
  const unsupported = ok ? result.applied.unsupported : [];
  const weather = draft.field?.weather ?? "none";

  const explainEnabled = ok && onExplain != null;

  return (
    <div className="calculator-panel" data-testid="calculator-panel">
      <div className="calculator-panel__row">
        <CalcSideFields
          testid="calc-side-attacker"
          title="Attacker"
          side={draft.attacker}
          onChange={(next) => patchSide("attacker", next)}
        />
        <CalcSideFields
          testid="calc-side-defender"
          title="Defender"
          side={draft.defender}
          onChange={(next) => patchSide("defender", next)}
        />
      </div>

      <div className="calc-move" data-testid="calc-move">
        <h3 className="calc-move__title">Move</h3>
        <label className="calculator-label">
          Move
          <EntityPicker
            kind="move"
            format={CHAMPIONS_FORMAT}
            value={draft.move.slug ?? ""}
            onChange={(slug) =>
              patch({
                ...draft,
                move: { ...draft.move, slug, name: slug },
              })
            }
            placeholder="Earthquake"
            ariaLabel="Move"
          />
        </label>
        {(draft.move.name || draft.move.slug) && (
          <span className="calc-side__species">
            {draft.move.name ?? draft.move.slug}
          </span>
        )}
      </div>

      <div className="calc-field" data-testid="calc-field">
        <h3 className="calc-field__title">Field</h3>
        <div className="calc-field__knobs">
          <fieldset className="calc-field__weather">
            <legend>Weather</legend>
            {WEATHERS.map((w) => (
              <label key={w}>
                <input
                  type="radio"
                  name="calc-weather"
                  value={w}
                  checked={weather === w}
                  onChange={() => patchField({ weather: w })}
                />{" "}
                {w}
              </label>
            ))}
          </fieldset>
          <div className="calc-field__checks">
            <label>
              <input
                type="checkbox"
                checked={Boolean(draft.field?.reflect)}
                onChange={(e) => patchField({ reflect: e.target.checked })}
              />{" "}
              Reflect
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(draft.field?.light_screen)}
                onChange={(e) => patchField({ light_screen: e.target.checked })}
              />{" "}
              Light Screen
            </label>
          </div>
        </div>
      </div>

      <div className="calculator-result" data-testid="calculator-result">
        <h3 className="calculator-result__title">Result</h3>
        {!ok || !estimate ? (
          <p
            className="calculator-result--empty"
            data-testid="calculator-result-empty"
          >
            Pick an attacker, a defender, and a damaging move to see an estimate.
          </p>
        ) : (
          <div className="calculator-estimate" data-testid="calculator-estimate">
            <span className="calculator-estimate__tag">Estimate</span>
            <p className="calculator-estimate__range">
              {estimate.min_damage}–{estimate.max_damage} (
              {estimate.percent_min}–{estimate.percent_max}%)
              {estimate.ko?.hits != null ? ` · ${estimate.ko.hits}HKO` : ""}
            </p>
          </div>
        )}

        {ok && unsupported.length > 0 && (
          <p data-testid="calculator-unsupported">
            {unsupported.join(", ")} — not modeled
          </p>
        )}

        {ok && result.caveat && (
          <p data-testid="calculator-caveat">{result.caveat}</p>
        )}

        {ok && result.common_spreads && result.common_spreads.length > 0 && (
          <table className="calculator-spreads">
            <thead>
              <tr>
                <th>Spread</th>
                <th>Damage</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {result.common_spreads.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    {row.estimate.min_damage}–{row.estimate.max_damage}
                  </td>
                  <td>
                    {row.estimate.percent_min}–{row.estimate.percent_max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {explainEnabled && (
        <div className="calculator-actions">
          <button
            type="button"
            className="calculator-btn calculator-btn--primary"
            onClick={() => {
              if (result) onExplain(explainCalcPrompt(draft, result));
            }}
          >
            Explain this calc
          </button>
        </div>
      )}
    </div>
  );
}

function CalcSideFields({
  testid,
  title,
  side,
  onChange,
}: {
  testid: string;
  title: string;
  side: CalcSide;
  onChange: (patch: Partial<CalcSide>) => void;
}) {
  const species = sideSpecies(side);
  const total = spTotal(side);
  const overBudget = total > SP_BUDGET;

  const spInputs = useMemo(() => {
    const evs = side.evs ?? {};
    return SP_KEYS.map((key) => (
      <label key={key} className="calculator-label">
        {key.toUpperCase()}
        <input
          type="number"
          min={0}
          max={SP_PER_STAT}
          value={typeof evs[key] === "number" ? evs[key] : ""}
          onChange={(e) => {
            const n = e.target.value === "" ? undefined : Number(e.target.value);
            onChange({
              evs: {
                ...evs,
                ...(n === undefined || Number.isNaN(n) ? {} : { [key]: n }),
              },
            });
          }}
        />
      </label>
    ));
  }, [side.evs, onChange]);

  return (
    <section className="calc-side" data-testid={testid}>
      <h3 className="calc-side__title">{title}</h3>
      <span className="calc-side__species">{species || "Empty"}</span>
      <p className="calc-side__species">Level {CHAMPIONS_LEVEL}</p>
      <label className="calculator-label">
        Species
        <EntityPicker
          kind="pokemon"
          format={CHAMPIONS_FORMAT}
          value={species}
          onChange={(value) => onChange({ species: value || undefined })}
          placeholder="Species"
          ariaLabel={`${title} species`}
          withSprite
        />
      </label>
      <label className="calculator-label">
        Ability
        <EntityPicker
          kind="ability"
          format={CHAMPIONS_FORMAT}
          value={side.ability ?? ""}
          onChange={(value) => onChange({ ability: value || null })}
          placeholder="Ability"
          ariaLabel={`${title} ability`}
        />
      </label>
      <label className="calculator-label">
        Item
        <EntityPicker
          kind="item"
          format={CHAMPIONS_FORMAT}
          value={side.item ?? ""}
          onChange={(value) => onChange({ item: value || null })}
          placeholder="Item"
          ariaLabel={`${title} item`}
        />
      </label>
      <label className="calculator-label">
        Nature
        <EntityPicker
          format={CHAMPIONS_FORMAT}
          value={side.nature ?? ""}
          onChange={(value) => onChange({ nature: value || null })}
          options={NATURE_OPTIONS}
          placeholder="Nature"
          ariaLabel={`${title} nature`}
        />
      </label>
      <span className="ilabel">Stat Points</span>
      <div className="calculator-evs">{spInputs}</div>
      <p className="calc-side__species">
        {total} / {SP_BUDGET}
        {overBudget ? " — over 66" : ""}
      </p>
    </section>
  );
}
