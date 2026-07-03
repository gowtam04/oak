/**
 * read-snapshot.ts — shared reader for the committed natdex JSON snapshots.
 *
 * The offline halves of the natdex warehouse (build-natdex / build-machines /
 * build-classic-encounters / build-pmd) all read a committed snapshot under
 * src/ingest/data/ via `fs`. This module centralises that read (plain JSON and
 * gzipped JSON) plus the "missing snapshot degrades to empty, never aborts the
 * whole ingest" guard the encounter builder established.
 *
 * IMPORTANT: imported ONLY (transitively) by src/ingest/run.ts — never the
 * request path — so the multi-MB blobs never enter the Next bundle.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(MODULE_DIR, "data");

/**
 * Read + parse a committed snapshot by file name (e.g. "natdex.json" or
 * "classic-encounters.json.gz"). Returns `null` (with a warning) when the file
 * is absent so a missing snapshot builds as "no rows" rather than crashing the
 * index build — the files are committed, so this is a guard, not a path.
 */
export function readSnapshot<T>(fileName: string): T | null {
  const file = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(file)) {
    console.warn(
      `[natdex] snapshot missing at ${file} — run \`npm run fetch:natdex\`. ` +
        `Building with no rows for this table.`,
    );
    return null;
  }
  const buf = fs.readFileSync(file);
  const text = fileName.endsWith(".gz")
    ? zlib.gunzipSync(buf).toString("utf8")
    : buf.toString("utf8");
  return JSON.parse(text) as T;
}
