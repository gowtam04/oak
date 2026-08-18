/**
 * /calc — first-class Calculator screen (CALC-US-1).
 * Expand from the overlay lands here with `oak-calc-scenario` in sessionStorage.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AppNav from "@/components/nav/AppNav";
import OakWordmark from "@/components/brand/OakWordmark";
import CalculatorPanel from "@/components/calc/CalculatorPanel";
import { fetchMe } from "@/lib/api/auth-client";
import { isFormat, type Format } from "@/data/formats";
import { calcScenarioSchema, type CalcScenario } from "@/lib/calc/calc-schema";

const SCENARIO_KEY = "oak-calc-scenario";
export const CALC_EXPLAIN_KEY = "oak-calc-explain";

function readStoredScenario(): CalcScenario | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SCENARIO_KEY);
    if (!raw) return null;
    const parsed = calcScenarioSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default function CalcPage() {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("national-dex");
  const [scenario, setScenario] = useState<CalcScenario | undefined>(undefined);

  useEffect(() => {
    const stored = readStoredScenario();
    if (stored) {
      setScenario(stored);
      setFormat(stored.format);
      return;
    }
    void fetchMe().then((me) => {
      if (typeof me.lastUsedScope === "string" && isFormat(me.lastUsedScope)) {
        setFormat(me.lastUsedScope);
      }
    });
  }, []);

  return (
    <main className="calc-page" data-testid="calc-page">
      <header className="calc-page__band">
        <Link
          href="/"
          className="calc-page__wordmark"
          aria-label="Oak — back to chat"
        >
          <OakWordmark />
        </Link>
      </header>
      <div className="calc-page__shell">
        <AppNav pathname="/calc" />
        <div className="calc-page__main">
          <h1 className="calc-page__heading">Calculator</h1>
          <CalculatorPanel
            format={format}
            scenario={scenario}
            onExplain={(message) => {
              try {
                window.sessionStorage.setItem(CALC_EXPLAIN_KEY, message);
              } catch {
                /* private mode */
              }
              router.push("/");
            }}
          />
        </div>
      </div>
    </main>
  );
}
