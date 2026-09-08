import SwiftUI

/// Formats the answer-card scope tag from `generation_basis.generation` — the native
/// mirror of web's `formatScopeTag` (`web/src/components/answer-card/scope-tag.ts`).
///
/// The wire `generation` is the `basisForFormat` tag, not a display string:
/// `"champions"`, `"national-dex"`, `"gen-9"`, `"gen-5"`…`"gen-8"`, or a
/// pre-Gen-9 fallback code like `"gen-1"`. This turns it into the label web
/// shows:
///
///   - `"champions"` → the live chip label from `GET /api/scope`
///     (e.g. `"Champions · Reg M-C"`), or `"Champions"` before the first fetch,
///   - `"national-dex"` → `"National Dex"` (the whole-Pokédex reference scope;
///     `basisForFormat` returns the raw format string for it, not a `gen-N` tag),
///   - `"gen-N"` → `"Gen N"`,
///   - anything else → returned unchanged (web's `return generation` fallback — an
///     already-display-form string passes straight through).
///
/// Structured like ``UncertaintyFlagLabels``: a small pure helper beside the view,
/// pinned by `ScopeTagTests`.
enum ScopeTag {
  /// Map a raw `generation` code to its display tag (see the type doc).
  /// `championsChipLabel` is the live `GET /api/scope` chip label (or the
  /// `"Champions"` fallback); historical answers paint the current regulation.
  static func label(for generation: String, championsChipLabel: String = RegulationMeta.fallback.chipLabel) -> String {
    if generation == "champions" {
      return championsChipLabel
    }
    if generation == "national-dex" {
      return "National Dex"
    }
    if generation.hasPrefix("gen-") {
      return "Gen \(generation.dropFirst("gen-".count))"
    }
    return generation
  }
}

/// The always-on **scope tag** at the top of an answer card — the native mirror of
/// the web `Masthead` scope tag (`web/src/components/answer-card/Masthead.tsx` +
/// `scope-tag.ts`). Every `OakAnswer` carries `generation_basis`, and web shows its
/// `generation` as a small neutral tag in the masthead **regardless of fallback**;
/// the fallback caution itself lives in the ``CaveatStripView`` right below (the web
/// `CaveatStrip`). This tag is therefore deliberately NEUTRAL — it never carries the
/// warning tint (that would double-signal the fallback the caveat strip already
/// owns).
///
/// Renders **nothing** when the generation string is blank (mirrors the render-if-
/// present rule; web's `formatScopeTag("")` is likewise empty). The tag text is the
/// wire `generation` code run through ``ScopeTag/label(for:championsChipLabel:)``
/// — e.g. `"gen-9"` → "Gen 9", `"champions"` → the live chip label — so it
/// reads the same as web's masthead tag; the fallback note and any
/// friendly-labeled uncertainty flags are surfaced by ``CaveatStripView``, not
/// here.
struct ScopeTagView: View {
  @Environment(AppState.self) private var appState
  let generationBasis: GenerationBasis

  var body: some View {
    let generation = generationBasis.generation
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if generation.isEmpty {
      EmptyView()
    } else {
      let display = ScopeTag.label(
        for: generation,
        championsChipLabel: appState.regulationChipLabel
      )
      Text(display)
        .instrumentLabel()
        .foregroundStyle(Theme.textSecondary)
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, Theme.Spacing.xs)
        .background(Theme.surfaceSunken, in: Capsule())
        .accessibilityLabel("Answer scope: \(display)")
    }
  }
}

#if DEBUG
#Preview {
  VStack(alignment: .leading, spacing: 16) {
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "gen-9", fallback: false, note: nil)
    )
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "champions", fallback: false, note: nil)
    )
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "national-dex", fallback: false, note: nil)
    )
    // Fallback: the tag stays neutral; the caution belongs to CaveatStripView.
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "gen-1", fallback: true, note: nil)
    )
  }
  .padding()
  .environment(AppState())
}
#endif
