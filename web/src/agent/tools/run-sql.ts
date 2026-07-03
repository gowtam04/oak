/**
 * T18 — `run_sql`.
 *
 * Lets the model answer whole-warehouse aggregation / set-operation questions
 * the typed tools can't express (natdex number == base-stat total, catch rate
 * higher than a pre-evolution, type combos unique to one evolutionary line,
 * dual-type → monotype evolutions) by writing SQL itself against a read-only
 * view of Oak's offline warehouse. All safety lives in the DB layer
 * (`src/data/sql-sandbox.ts`): a READ ONLY transaction, a single statement over
 * the extended protocol, `statement_timeout`, the `oak_readonly` role or a
 * deny-list floor, and a 200-row cap. This tool is a thin adapter — it parses
 * input, hands the query to the sandbox, and returns the documented union. It
 * never throws in-domain: a parse failure or any query error collapses to the
 * `query_failed` / `query_timeout` miss shapes, whose `hint` carries the raw
 * Postgres message so the model can fix the SQL on the next loop iteration.
 */

import type { ToolDef } from "@/agent/types";
import {
  runSqlInputSchema,
  toJsonSchema,
  type RunSqlOutput,
} from "@/agent/schemas";
import { runSandboxedQuery } from "@/data/sql-sandbox";

const description =
  "Run a read-only SQL query against Oak's offline warehouse. Use ONLY for " +
  "aggregations, set-operations, and cross-cutting queries the typed tools " +
  "can't express (e.g. 'species whose national-dex number equals their base-" +
  "stat total', 'Pokémon with a higher catch rate than their pre-evolution', " +
  "type combos unique to one evolutionary line, dual-type Pokémon that evolve " +
  "into a monotype). For a single species/move/ability/item lookup, battle " +
  "math, type matchups, encounters, or usage, the typed tools are faster and " +
  "authoritative — prefer those. Results come from Oak's offline warehouse, " +
  "not the live games. Queries are read-only, a SINGLE statement, and capped at " +
  "200 rows. The exposed tables and their columns are documented in the system " +
  "prompt. On error, read the `hint`, fix the SQL, and retry.";

export const runSqlTool: ToolDef = {
  name: "run_sql",
  description,
  inputSchema: toJsonSchema(runSqlInputSchema),
  async run(args, ctx): Promise<RunSqlOutput> {
    const parsed = runSqlInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        error: "query_failed",
        hint: "invalid input: query (1..5000 chars) and purpose (1..200 chars) are required",
      };
    }

    ctx.logger.debug(
      { purpose: parsed.data.purpose, tool: "run_sql" },
      "run_sql invoked",
    );

    return runSandboxedQuery(parsed.data.query);
  },
};
