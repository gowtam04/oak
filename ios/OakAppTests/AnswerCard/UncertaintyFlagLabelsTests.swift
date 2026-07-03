import Testing

@testable import OakApp

/// `UncertaintyFlagLabels` — the native mirror of the web
/// `uncertainty-labels.ts`. Pins each internal fallback code → friendly copy (so a
/// drift from the web map is caught) and the verbatim passthrough for genuine
/// model-authored caveats.
struct UncertaintyFlagLabelsTests {

  @Test
  func internalFallbackCodesMapToFriendlyCopy() {
    #expect(UncertaintyFlagLabels.label(for: "max_iterations_reached") == "Couldn't complete this answer")
    #expect(UncertaintyFlagLabels.label(for: "submit_answer_invalid_after_retries") == "Couldn't complete this answer")
    #expect(UncertaintyFlagLabels.label(for: "model_ended_turn_without_submit_answer") == "Couldn't complete this answer")
    #expect(UncertaintyFlagLabels.label(for: "recovered_prose_no_submit_answer") == "Answer may be incomplete")
    #expect(
      UncertaintyFlagLabels.label(for: "team_may_have_illegal_slots")
        == "Some team slots may not be fully legal — see the warnings on each Pokémon."
    )
  }

  @Test
  func exactlyTheFiveWebCodesAreMapped() {
    // The map must match the web `UNCERTAINTY_FLAG_LABELS` key set exactly — no more,
    // no fewer — so a genuine caveat is never accidentally rewritten.
    #expect(
      Set(UncertaintyFlagLabels.map.keys) == [
        "max_iterations_reached",
        "submit_answer_invalid_after_retries",
        "model_ended_turn_without_submit_answer",
        "recovered_prose_no_submit_answer",
        "team_may_have_illegal_slots",
      ]
    )
  }

  @Test
  func genuineModelAuthoredCaveatsRenderVerbatim() {
    let caveat = "Damage roll is an estimate — the opponent's exact spread is unknown."
    #expect(UncertaintyFlagLabels.label(for: caveat) == caveat)
    #expect(UncertaintyFlagLabels.label(for: "This Pokémon is not available in Gen 9.")
      == "This Pokémon is not available in Gen 9.")
    // A code-like-but-unknown string is still treated as a genuine caveat (verbatim).
    #expect(UncertaintyFlagLabels.label(for: "some_future_code") == "some_future_code")
  }
}
