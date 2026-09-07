/**
 * Champions-first reference cutover — catalog/export pins that would bloat
 * schema.test.ts. Trace: CF-DATA-BR-3, CF-OPS-AC-1.1, CF-OPS-AC-1.2,
 * CF-OPS-AC-1.5, CF-DEX-AC-1.3, CF-INT-BR-3, ADR-3, ADR-4.
 *
 * Runtime catalog DROPs live in schema.test.ts (createPgSchema applies 0023).
 * This file pins the TypeScript schema module + ingest default without a DB.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as schema from "@/data/schema";
import { DEFAULT_FORMATS, isFormat } from "@/data/formats";

const DROPPED_TABLES = [
  "wiki_page",
  "wiki_chunk",
  "natdex_species",
  "natdex_machines",
  "natdex_moves",
  "classic_encounters",
  "pmd_recruits",
  "meta_snapshot",
  "meta_usage",
] as const;

const KEPT_TABLES = [
  "pokemon",
  "learnset",
  "reference_cache",
  "searchable_names",
  "ingest_meta",
  "team",
  "conversation",
  "conversation_message",
  "turn_record",
  "account",
  "champions_item_exclusion",
  "shared_answer",
] as const;

describe("schema module after cutover (CF-DATA-BR-3, CF-INT-BR-3, ADR-4)", () => {
  it("does not export dropped other-game tables", () => {
    for (const name of DROPPED_TABLES) {
      expect(schema, `schema must not export ${name}`).not.toHaveProperty(name);
    }
  });

  it("still exports Champions index + app tables (CF-OPS-AC-1.5)", () => {
    for (const name of KEPT_TABLES) {
      expect(schema, `schema must still export ${name}`).toHaveProperty(name);
    }
  });
});

describe("ingest default is Champions-only (CF-DATA-BR-3, CF-DEX-AC-1.3, ADR-4)", () => {
  it("DEFAULT_FORMATS is exactly [\"champions\"] so gen-7 is not ingested", () => {
    expect([...DEFAULT_FORMATS]).toEqual(["champions"]);
    expect(DEFAULT_FORMATS).not.toContain("gen-7");
  });

  it("isFormat still accepts archived stored-row values (ADR-3)", () => {
    expect(isFormat("gen-7")).toBe(true);
  });
});

describe("dropped readers are gone (CF-INT-BR-3)", () => {
  it("wiki-repo.ts is deleted", () => {
    const path = fileURLToPath(new URL("./repos/wiki-repo.ts", import.meta.url));
    expect(existsSync(path)).toBe(false);
  });

  it("meta-repo.ts is deleted", () => {
    const path = fileURLToPath(new URL("./repos/meta-repo.ts", import.meta.url));
    expect(existsSync(path)).toBe(false);
  });
});
