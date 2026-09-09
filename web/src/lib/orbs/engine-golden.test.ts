import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODE_FRAMES } from "./engine/registry";
import { resolvePreset } from "./presets";
import type { OrbSize, OrbState } from "./types";

interface GoldenCase {
  key: string;
  state: OrbState;
  size: OrbSize;
  t: number;
  dotCount: number;
  lineCount: number;
  dots: number[];
  lines: number[];
}

interface GoldenFixture {
  tolerance: number;
  cases: GoldenCase[];
}

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "orbs-golden.fixture.json"),
    "utf8",
  ),
) as GoldenFixture;

function flattenDots(dots: { x: number; y: number; z: number; r: number; white: number; a?: number }[]): number[] {
  const out: number[] = [];
  for (const d of dots) {
    out.push(d.x, d.y, d.z, d.r, d.white, d.a ?? 1);
  }
  return out;
}

function flattenLines(
  lines: { x1: number; y1: number; x2: number; y2: number; white: number; a?: number; w: number }[],
): number[] {
  const out: number[] = [];
  for (const l of lines) {
    out.push(l.x1, l.y1, l.x2, l.y2, l.white, l.a ?? 1, l.w);
  }
  return out;
}

describe("thinking-orbs engine golden", () => {
  it("matches the 0.3.1 fixture within 1e-4", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
    const eps = fixture.tolerance;
    for (const c of fixture.cases) {
      const { mode, opts } = resolvePreset(c.state, c.size);
      const frame = MODE_FRAMES[mode](c.size, c.t, opts);
      expect(frame.dots.length, c.key).toBe(c.dotCount);
      expect(frame.lines.length, c.key).toBe(c.lineCount);
      const gotDots = flattenDots(frame.dots);
      const gotLines = flattenLines(frame.lines);
      expect(gotDots.length, c.key).toBe(c.dots.length);
      expect(gotLines.length, c.key).toBe(c.lines.length);
      for (let i = 0; i < gotDots.length; i++) {
        expect(Math.abs(gotDots[i]! - c.dots[i]!), `${c.key} dots[${i}]`).toBeLessThanOrEqual(eps);
      }
      for (let i = 0; i < gotLines.length; i++) {
        expect(Math.abs(gotLines[i]! - c.lines[i]!), `${c.key} lines[${i}]`).toBeLessThanOrEqual(eps);
      }
    }
  });
});
