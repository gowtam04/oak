"use client";

/**
 * Dev-only plate wash intensity tuner (soul.md Phase 3 / Eve "build dials").
 *
 * Visible when `process.env.NODE_ENV === "development"` OR `?plateTuner=1`.
 * Adjusts CSS custom properties that drive specimen-plate wash mix strengths
 * on `.answer-card` / `.artifact-viewer`. Must not appear for normal production
 * users (query-param opt-in only outside dev).
 */

import { useEffect, useState } from "react";

const ROOT_VARS = [
  { key: "--plate-wash-a", label: "Wash A", min: 0, max: 30, step: 1, unit: "%" },
  { key: "--plate-wash-b", label: "Wash B", min: 0, max: 24, step: 1, unit: "%" },
  { key: "--plate-radial-a", label: "Radial A", min: 0, max: 40, step: 1, unit: "%" },
  { key: "--plate-radial-b", label: "Radial B", min: 0, max: 32, step: 1, unit: "%" },
  { key: "--plate-edge", label: "Edge", min: 8, max: 50, step: 1, unit: "%" },
] as const;

type VarKey = (typeof ROOT_VARS)[number]["key"];

const DEFAULTS: Record<VarKey, number> = {
  "--plate-wash-a": 8,
  "--plate-wash-b": 6,
  "--plate-radial-a": 12,
  "--plate-radial-b": 10,
  "--plate-edge": 28,
};

function shouldShowTuner(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return new URLSearchParams(window.location.search).get("plateTuner") === "1";
  } catch {
    return false;
  }
}

export default function PlateTuner(): React.JSX.Element | null {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Record<VarKey, number>>({ ...DEFAULTS });

  useEffect(() => {
    setEnabled(shouldShowTuner());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    for (const [key, n] of Object.entries(values) as [VarKey, number][]) {
      root.style.setProperty(key, `${n}%`);
    }
    return () => {
      for (const key of Object.keys(DEFAULTS) as VarKey[]) {
        root.style.removeProperty(key);
      }
    };
  }, [enabled, values]);

  if (!enabled) return null;

  return (
    <div className="plate-tuner" data-testid="plate-tuner">
      <div className="plate-tuner__head">
        <span className="ilabel plate-tuner__title">Plate tuner</span>
        <button
          type="button"
          className="plate-tuner__toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="plate-tuner__body">
          {ROOT_VARS.map((v) => (
            <label key={v.key} className="plate-tuner__row">
              <span className="plate-tuner__label">
                {v.label}{" "}
                <span className="mono-num">
                  {values[v.key]}
                  {v.unit}
                </span>
              </span>
              <input
                type="range"
                min={v.min}
                max={v.max}
                step={v.step}
                value={values[v.key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setValues((prev) => ({ ...prev, [v.key]: n }));
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="plate-tuner__reset"
            onClick={() => setValues({ ...DEFAULTS })}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
