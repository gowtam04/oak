/**
 * Friendly labels for the runtime's INTERNAL fallback `uncertainty_flags` codes.
 *
 * When a turn can't complete through the normal tool loop, `runtime.ts`
 * synthesizes an answer tagged with a diagnostic reason code (e.g.
 * `max_iterations_reached`). Those codes are engineering signals, not something a
 * user should read raw in the caveat strip. This map renders them as plain
 * English. GENUINE model-authored uncertainty flags are free-form strings, are
 * NOT in this map, and render verbatim (the raw-string fallback) — those are the
 * real per-answer caveats the model chose to surface.
 *
 * Single source of truth for the flag→label mapping (mirrors the admin panel's
 * `STATUS_LABEL` pattern). Pinned by `CaveatStrip.test.tsx`.
 */
const UNCERTAINTY_FLAG_LABELS: Record<string, string> = {
  // The three "gave up" fallbacks (synthesizeInsufficientData reasons).
  max_iterations_reached: "Couldn't complete this answer",
  submit_answer_invalid_after_retries: "Couldn't complete this answer",
  model_ended_turn_without_submit_answer: "Couldn't complete this answer",
  // The model wrote prose but never called submit_answer (recovered, status
  // "answered") — not a hard failure, just possibly partial.
  recovered_prose_no_submit_answer: "Answer may be incomplete",
  // A best-effort team was surfaced despite failing format legality (see the
  // salvage path in runtime.ts). The per-slot badges say WHICH slots; this says
  // WHY they're flagged.
  team_may_have_illegal_slots:
    "Some team slots may not be fully legal — see the warnings on each Pokémon.",
};

/**
 * Map an uncertainty flag to a user-facing label. Known internal fallback codes
 * get friendly text; anything else (a genuine model-authored caveat) is returned
 * unchanged.
 */
export function labelForUncertaintyFlag(flag: string): string {
  return UNCERTAINTY_FLAG_LABELS[flag] ?? flag;
}
