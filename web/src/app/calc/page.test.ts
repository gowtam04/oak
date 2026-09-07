/**
 * /calc — Champions calculator chrome (P6c).
 *
 * No generation/format picker. Level is 50 (not a free knob). Investment is
 * Stat Points. Species pickers are the Champions roster. IVs are not a user
 * knob. Source-level pins cover the page and the shared CalculatorPanel it
 * renders (jsdom does not collect src/app page tests).
 *
 * Requirement refs: CF-CALC-US-1, CF-CALC-AC-1.1, CF-CALC-AC-1.2, CF-UI-US-8,
 * CF-UI-AC-8.1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "page.tsx"), "utf8");
const layoutSrc = readFileSync(join(here, "layout.tsx"), "utf8");
const panelSrc = readFileSync(
  join(here, "../../components/calc/CalculatorPanel.tsx"),
  "utf8",
);

const OTHER_GAMES = [
  "national-dex",
  "scarlet-violet",
  "gen-1",
  "gen-2",
  "gen-3",
  "gen-4",
  "gen-5",
  "gen-6",
  "gen-7",
  "gen-8",
];

describe("/calc page — no format picker (CF-CALC-AC-1.1, CF-UI-AC-8.1)", () => {
  it("does not seed a format picker or lastUsedScope game", () => {
    expect(pageSrc).not.toMatch(/useState<Format>/);
    expect(pageSrc).not.toMatch(/lastUsedScope/);
    expect(pageSrc).not.toMatch(/isFormat/);
    expect(pageSrc).not.toMatch(/setFormat/);
    expect(pageSrc).not.toMatch(/data-testid="calc-format"/);
    for (const format of OTHER_GAMES) {
      expect(pageSrc).not.toContain(`"${format}"`);
    }
  });

  it("binds the calculator to Champions", () => {
    expect(pageSrc).toMatch(/champions/i);
    expect(pageSrc).not.toMatch(/FORMATS\.map/);
  });

  it("layout copy does not advertise a multi-format calculator", () => {
    expect(layoutSrc).not.toMatch(/National Dex/i);
    expect(layoutSrc).not.toMatch(/Scarlet/i);
    expect(layoutSrc).not.toMatch(/generation/i);
  });
});

describe("CalculatorPanel — L50 Stat Points, roster species (CF-CALC-AC-1.2, CF-UI-AC-8.1)", () => {
  it("has no generation/format <select>", () => {
    expect(panelSrc).not.toMatch(/data-testid="calc-format"/);
    expect(panelSrc).not.toMatch(/FORMATS\.map/);
    expect(panelSrc).not.toMatch(/>Format\s*</);
    expect(panelSrc).not.toMatch(/label className="calculator-label">\s*Format/i);
  });

  it("does not list other games as options", () => {
    expect(panelSrc).not.toMatch(/FORMATS/);
    for (const format of OTHER_GAMES) {
      expect(panelSrc).not.toContain(`"${format}"`);
    }
  });

  it("uses Stat Points for investment, not EVs", () => {
    expect(panelSrc).toMatch(/Stat Point/i);
    expect(panelSrc).not.toMatch(/<span className="ilabel">EVs<\/span>/);
    expect(panelSrc).not.toMatch(/>EVs</);
  });

  it("does not expose IV knobs (IVs are fixed 31)", () => {
    expect(panelSrc).not.toMatch(/<span className="ilabel">IVs<\/span>/);
    expect(panelSrc).not.toMatch(/aria-label=\{`\$\{title\} \$\{key\} IVs`\}/);
    expect(panelSrc).not.toMatch(/\bIVs\b/);
  });

  it("reads level 50 and is not a 1–100 free knob", () => {
    expect(panelSrc).toMatch(/\b50\b/);
    expect(panelSrc).not.toMatch(/min=\{1\}\s*\n\s*max=\{100\}/);
    expect(panelSrc).not.toMatch(/label className="calculator-label">\s*Level/i);
  });

  it("species pickers search the Champions roster", () => {
    expect(panelSrc).toMatch(/kind="pokemon"/);
    expect(panelSrc).toMatch(/CHAMPIONS_FORMAT|"champions"/);
  });
});
