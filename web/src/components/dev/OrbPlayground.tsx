"use client";

/**
 * Dev-only thinking-orb playground. Visible when `?orbs=1`.
 * Lets us judge all nine states at both tuned sizes without a live turn.
 */

import { useEffect, useState } from "react";
import ThinkingOrbMark from "@/components/chat/ThinkingOrbMark";
import { ORB_STATES, type OrbSize, type OrbState } from "@/lib/orbs/types";

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("orbs") === "1";
  } catch {
    return false;
  }
}

export default function OrbPlayground(): React.JSX.Element | null {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<OrbState>("breathing");
  const [size, setSize] = useState<OrbSize>(20);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setEnabled(shouldShow());
  }, []);

  if (!enabled) return null;

  return (
    <div className="orb-playground" data-testid="orb-playground">
      <div className="orb-playground__head">
        <span className="ilabel orb-playground__title">Thinking orbs</span>
        <button
          type="button"
          className="orb-playground__toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="orb-playground__body">
          <div className="orb-playground__stage">
            <ThinkingOrbMark state={state} size={size} paused={paused} />
            <span className="orb-playground__caption">
              {state} · {size}px
            </span>
          </div>
          <div className="orb-playground__chips">
            {ORB_STATES.map((s) => (
              <button
                key={s}
                type="button"
                className={
                  "orb-playground__chip" +
                  (s === state ? " orb-playground__chip--on" : "")
                }
                onClick={() => setState(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="orb-playground__row">
            <button
              type="button"
              className="orb-playground__toggle"
              onClick={() => setSize((n) => (n === 20 ? 64 : 20))}
            >
              Size {size}
            </button>
            <button
              type="button"
              className="orb-playground__toggle"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
