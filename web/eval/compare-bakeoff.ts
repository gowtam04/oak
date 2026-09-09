/**
 * Compare two judged eval --json reports (typically grok-4.6 vs grok-4.3).
 *
 *   npx tsx eval/compare-bakeoff.ts /tmp/oak-46.json /tmp/oak-43.json
 */

import { readFileSync } from "node:fs";

import {
  formatComparison,
  type BakeoffRunFile,
} from "./bakeoff-cost";

function load(path: string): BakeoffRunFile {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(extractJson(raw)) as BakeoffRunFile;
  if (!parsed.model || !Array.isArray(parsed.results)) {
    throw new Error(`${path} is not a judged eval JSON report`);
  }
  return parsed;
}

/** Tolerate pino lines before/after the JSON object. */
function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("no JSON object found in report file");
  }
  return raw.slice(start, end + 1);
}

function main(argv: string[]): number {
  const [left, right] = argv;
  if (!left || !right) {
    // eslint-disable-next-line no-console
    console.error(
      "usage: tsx eval/compare-bakeoff.ts <left.json> <right.json>",
    );
    return 1;
  }
  // eslint-disable-next-line no-console
  console.log(formatComparison(load(left), load(right)));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
