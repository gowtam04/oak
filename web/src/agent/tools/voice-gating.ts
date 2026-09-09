/**
 * Voice-mode tool exclusion set (Champions-first, ADR-2).
 *
 * Both voice sites (`voice-session.ts`'s `voiceToolDefs()` — the realtime
 * session's advertised tool list — and `/api/voice/tool`'s allowlist guard,
 * which must reject anything the socket wasn't offered) filter the main barrel
 * through this set. Voice speaks its answer — there is no OakAnswer output
 * contract — so `submit_answer` stays excluded.
 *
 * T14 `get_encounters`, T18 `run_sql`, T19 `search_wiki`, and T21
 * `get_meta_usage` are gone from the barrel (ADR-2); they are not named here.
 */

export const VOICE_EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
  "submit_answer",
]);
