/**
 * Voice-mode tool exclusion set (oak-v2 P5 — design.md §5 "Voice gating").
 *
 * Both voice sites (`voice-session.ts`'s `voiceToolDefs()` — the realtime
 * session's advertised tool list — and `/api/voice/tool`'s allowlist guard,
 * which must reject anything the socket wasn't offered) used to build their
 * list as `tools.filter(t => t.name !== "submit_answer")`. That filter
 * auto-admits every NEW tool appended to the main barrel, which is wrong for
 * tools with no place on a client-driven realtime socket: `submit_answer`
 * (voice speaks its answer — there is no OakAnswer output contract) and
 * network/warehouse tools that are either irrelevant to a spoken turn or too
 * slow/broad for the realtime loop. `run_sql` and `search_wiki` are named
 * here so their addition never has to touch voice code again. (T20
 * `web_search` was named here too until it was removed 2026-07-03.)
 *
 * T21 `get_meta_usage` is deliberately NOT listed — it was ADMITTED to voice
 * (it stays a fast, bounded DB read of stored monthly usage, the same reasoning
 * that keeps T15 `get_usage_stats` admitted), so the default "everything except
 * this set" filter picks it up for the realtime session with no change here.
 *
 * Both voice sites import THIS set instead of hand-rolling the filter.
 */
export const VOICE_EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
  "submit_answer",
  "run_sql",
  "search_wiki",
]);
