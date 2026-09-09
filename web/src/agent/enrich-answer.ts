/**
 * Server-side answer enrichment — makes Pokémon sprites/dex MODEL-INDEPENDENT.
 *
 * The agent's `submit_answer` payload carries `sprite_url`/`dex_number` only if
 * the model bothered to copy them out of the tool results; weaker models (e.g.
 * Grok 4.3) omit them, so the answer renders no sprite card and an iconless
 * candidate table. This pass runs AFTER schema validation and backfills
 * `sprite_url` + `dex_number` + `types` into every candidate row and subject from
 * the index for the active format. For a single-entity answer that has no
 * `subjects[]` at all, it synthesizes one subject from the `get_pokemon` profile
 * the turn already fetched (so the sprite card still renders).
 *
 * Provider-agnostic (fixes Grok and GPT-5.5; a no-op for an answer Claude already
 * filled). It NEVER throws and NEVER weakens an answer: any failure — or an
 * enriched payload that fails re-validation — returns the original answer
 * unchanged. Sprite URL and dex number are index-owned when a SpriteRef exists
 * (a hallucinated PokeAPI form id must not win). Other model-supplied fields
 * (base_stats, types already filled) are left untouched.
 *
 * It ALSO owns `candidates.hidden_rows` (the rows beyond `shown` for a truncated
 * list, so clients expand locally instead of firing a follow-up turn): the field
 * is server-owned, so any model-emitted value is stripped first, then repopulated
 * from the turn's own `query_pokedex` call when the list is truncated and bounded.
 */

import { formatForMode, type Format } from "@/data/formats";
import {
  getPokemon,
  queryPokedex,
  spriteRefsByNames,
  type SpriteRef,
} from "@/data/repos/pokedex-repo";
import { resolveEntity } from "@/data/repos/resolve-index";
import { toPokedexFilters } from "@/agent/tools/query-pokedex";
import type { OakDb } from "@/data/db";
import {
  oakAnswerSchema,
  queryPokedexInputSchema,
  queryPokedexResultSchema,
  TYPE_NAMES,
  type Candidates,
  type OakAnswer,
  type PokedexRow,
  type PokemonProfile,
  type Subject,
  type TypeName,
} from "@/agent/schemas";
import type { AgentContext } from "@/agent/types";

/** One row of a rendered candidate list (`candidates.shown` / `.hidden_rows`). */
type CandidateRow = Candidates["shown"][number];

const TYPE_SET = new Set<string>(TYPE_NAMES);

/** Keep only the 18 canonical type slugs (subjects/candidate rows are enum-typed). */
function asTypeNames(types: string[]): TypeName[] {
  return types.filter((t): t is TypeName => TYPE_SET.has(t));
}

/**
 * Backfill sprites/dex/types into a validated answer and (for a lone-entity
 * answer) synthesize a subject from the turn's looked-up profiles.
 */
export async function enrichAnswer(
  answer: OakAnswer,
  ctx: AgentContext,
  lookedUpProfiles: PokemonProfile[],
  queryPokedexCalls: { args: unknown; result: unknown }[] = [],
): Promise<OakAnswer> {
  // `hidden_rows` is model-VISIBLE in the derived submit_answer JSON Schema but
  // SERVER-OWNED — unconditionally strip anything the model authored before we
  // (maybe) repopulate it ourselves. Mirrors the saved_team/stampTeamWarnings
  // precedent (server owns the field regardless of what the model emitted).
  if (answer.candidates) delete answer.candidates.hidden_rows;

  try {
    const format = formatForMode(ctx.mode);
    const db = ctx.db as unknown as OakDb;

    // The rows beyond `shown` for a truncated list, re-derived server-side from
    // the turn's own query_pokedex call. Computed before sprite backfill so its
    // names ride the same batch sprite lookup as `shown`.
    const hiddenRows = answer.candidates
      ? await computeHiddenRows(answer.candidates, queryPokedexCalls, format, db)
      : undefined;

    const candidateNames = answer.candidates?.shown.map((r) => r.name) ?? [];
    const hiddenNames = hiddenRows?.map((r) => r.name) ?? [];
    const subjectNames = answer.subjects?.map((s) => s.name) ?? [];
    const names = [...candidateNames, ...hiddenNames, ...subjectNames];

    const refs =
      names.length > 0
        ? await spriteRefsByNames(names, format, db)
        : new Map<string, SpriteRef>();

    // Tier-3: anything the batch query missed → fuzzy resolve + single read.
    for (const name of new Set(names)) {
      if (refs.has(name)) continue;
      const ref = await refByFuzzy(name, format, db);
      if (ref) refs.set(name, ref);
    }

    const candidates = answer.candidates
      ? enrichCandidates(answer.candidates, refs, hiddenRows)
      : undefined;

    let subjects = answer.subjects
      ? enrichSubjects(answer.subjects, refs)
      : undefined;

    // Auto-derive subjects[] for a single-entity answer that omitted it (the
    // "Does Fake Out work on Farigiraf?" case): exactly one fetched profile and
    // no candidate list → render its sprite card.
    if (
      (!subjects || subjects.length === 0) &&
      !answer.candidates &&
      lookedUpProfiles.length === 1
    ) {
      subjects = [subjectFromProfile(lookedUpProfiles[0]!)];
    }

    const enriched: OakAnswer = { ...answer };
    if (candidates) enriched.candidates = candidates;
    if (subjects && subjects.length > 0) enriched.subjects = subjects;

    // Safety net: only adopt the enriched answer if it still validates.
    return oakAnswerSchema.parse(enriched);
  } catch (err) {
    ctx.logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "answer_enrichment_failed",
    );
    return answer;
  }
}

/** Fuzzy fallback: resolve the name to a slug, then read that profile's refs. */
async function refByFuzzy(
  name: string,
  format: Format,
  db: OakDb,
): Promise<SpriteRef | null> {
  try {
    const res = await resolveEntity(name, "pokemon", 1, format);
    const slug = res.matches[0]?.slug;
    if (!slug) return null;
    const profile = await getPokemon(slug, format, db);
    if (!profile.found) return null;
    return {
      display_name: profile.display_name,
      sprite_url: profile.sprite_url,
      dex_number: profile.national_dex_number,
      types: profile.types,
      base_stats: profile.base_stats,
    };
  } catch {
    return null;
  }
}

function enrichCandidates(
  candidates: Candidates,
  refs: Map<string, SpriteRef>,
  hiddenRows?: CandidateRow[],
): Candidates {
  const backfill = (row: CandidateRow): CandidateRow => {
    const ref = refs.get(row.name);
    const next = ref
      ? {
          ...row,
          sprite_url: ref.sprite_url,
          dex_number: ref.dex_number,
          types: row.types.length > 0 ? row.types : asTypeNames(ref.types),
        }
      : { ...row };
    // Drop the empty key_stats:{} junk some models emit (P4g).
    if (next.key_stats && Object.keys(next.key_stats).length === 0) {
      delete next.key_stats;
    }
    return next;
  };

  const next: Candidates = {
    ...candidates,
    shown: candidates.shown.map(backfill),
  };
  // Server-owned: only set hidden_rows when we actually computed some; otherwise
  // leave it absent (the spread above carries none — it was stripped upstream).
  if (hiddenRows && hiddenRows.length > 0) {
    next.hidden_rows = hiddenRows.map(backfill);
  } else {
    delete next.hidden_rows;
  }
  return next;
}

/**
 * Re-derive the rows beyond `shown` for a TRUNCATED candidate list from the
 * turn's own `query_pokedex` call, so clients can expand locally. Bounded and
 * best-effort: returns undefined (no hidden_rows) unless the list is genuinely
 * truncated, small enough (≤200 total), and traceable to exactly one matching
 * query_pokedex call whose re-run yields a deterministic superset.
 */
async function computeHiddenRows(
  candidates: Candidates,
  queryPokedexCalls: { args: unknown; result: unknown }[],
  format: Format,
  db: OakDb,
): Promise<CandidateRow[] | undefined> {
  const shownLen = candidates.shown.length;
  const total = candidates.total_count;
  if (!candidates.truncated || total > 200 || total <= shownLen) return undefined;

  const source = findSourceCall(candidates, queryPokedexCalls);
  if (!source) return undefined;

  const parsedArgs = queryPokedexInputSchema.safeParse(source.args);
  if (!parsedArgs.success) return undefined;

  // Re-run the identical query lifting the 100-row cap so the full match set
  // (≤200) comes back; the repo orders with an asc(pokemon.id) tiebreak, so the
  // slice past `shown` is deterministic.
  const full = await queryPokedex(
    toPokedexFilters({ ...parsedArgs.data, limit: 200 }),
    format,
    db,
    { maxLimit: 200 },
  );
  if (!("results" in full)) return undefined; // index_unavailable / unresolved

  return full.results.slice(shownLen, total).map(pokedexRowToCandidate);
}

/**
 * Find the single stashed query_pokedex call that produced this truncated list:
 * a successful result marked `truncated` whose `total_count` matches. Requires
 * EXACTLY one match — an ambiguous trace (two queries with the same total) is
 * skipped rather than guessed.
 */
function findSourceCall(
  candidates: Candidates,
  queryPokedexCalls: { args: unknown; result: unknown }[],
): { args: unknown; result: unknown } | undefined {
  const matches = queryPokedexCalls.filter((call) => {
    const parsed = queryPokedexResultSchema.safeParse(call.result);
    return (
      parsed.success &&
      parsed.data.truncated === true &&
      parsed.data.total_count === candidates.total_count
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Shape a raw query_pokedex row into the candidate-row form (sprites/dex/types
 * get backfilled alongside `shown` in {@link enrichCandidates}). */
function pokedexRowToCandidate(row: PokedexRow): CandidateRow {
  return {
    name: row.display_name,
    dex_number: row.national_dex_number,
    sprite_url: row.sprite_url,
    types: asTypeNames(row.types),
    base_stats: row.base_stats,
  };
}

function enrichSubjects(
  subjects: Subject[],
  refs: Map<string, SpriteRef>,
): Subject[] {
  return subjects.map((s) => {
    const ref = refs.get(s.name);
    if (!ref) return s;
    return {
      ...s,
      sprite_url: ref.sprite_url,
      dex_number: ref.dex_number,
      types: s.types.length > 0 ? s.types : asTypeNames(ref.types),
    };
  });
}

function subjectFromProfile(p: PokemonProfile): Subject {
  return {
    name: p.display_name,
    dex_number: p.national_dex_number,
    sprite_url: p.sprite_url,
    types: asTypeNames(p.types),
    is_fallback: !p.is_gen9_native,
    source_generation: p.source_generation ?? undefined,
  };
}
