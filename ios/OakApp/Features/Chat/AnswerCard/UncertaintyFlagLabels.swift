import Foundation

/// Friendly labels for the runtime's INTERNAL fallback `uncertainty_flags` codes —
/// the native mirror of `web/src/components/answer-card/uncertainty-labels.ts`.
///
/// When a turn can't complete through the normal tool loop, the server's `runtime.ts`
/// synthesizes an answer tagged with a diagnostic reason code (e.g.
/// `max_iterations_reached`). Those codes are engineering signals, not something a
/// user should read raw in the caveat strip, so this map renders them as plain
/// English. GENUINE model-authored uncertainty flags are free-form strings, are NOT
/// in this map, and render **verbatim** — those are the real per-answer caveats the
/// model chose to surface.
///
/// Single source of truth for the flag→label mapping (mirrors the web file, pinned
/// by `UncertaintyFlagLabelsTests`). Keep the keys and copy in lockstep with the web
/// map — a drift there is a user-visible drift here.
enum UncertaintyFlagLabels {
  /// The internal fallback codes and their user-facing copy. Any flag not present
  /// here is a genuine model-authored caveat and is shown unchanged.
  static let map: [String: String] = [
    // The three "gave up" fallbacks (synthesizeInsufficientData reasons).
    "max_iterations_reached": "Couldn't complete this answer",
    "submit_answer_invalid_after_retries": "Couldn't complete this answer",
    "model_ended_turn_without_submit_answer": "Couldn't complete this answer",
    // The model wrote prose but never called submit_answer (recovered, status
    // "answered") — not a hard failure, just possibly partial.
    "recovered_prose_no_submit_answer": "Answer may be incomplete",
    // A best-effort team was surfaced despite failing format legality. The per-slot
    // badges say WHICH slots; this says WHY they're flagged.
    "team_may_have_illegal_slots":
      "Some team slots may not be fully legal — see the warnings on each Pokémon.",
  ]

  /// Map an uncertainty flag to a user-facing label. Known internal fallback codes
  /// get friendly text; anything else (a genuine model-authored caveat) is returned
  /// unchanged.
  static func label(for flag: String) -> String {
    map[flag] ?? flag
  }
}
