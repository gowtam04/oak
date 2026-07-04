import SwiftUI

/// Formats the answer-card scope tag from `generation_basis.generation` — the native
/// mirror of web's `formatScopeTag` (`web/src/components/answer-card/scope-tag.ts`).
///
/// The wire `generation` is the `basisForFormat` tag, not a display string:
/// `"champions"`, `"gen-9"`, `"gen-5"`…`"gen-8"`, or a pre-Gen-9 fallback code like
/// `"gen-1"`. This turns it into the label web shows:
///
///   - `"champions"` → `"Champions · Reg M-B"` (the current regulation, `Regulation `
///     shortened to `Reg ` exactly as web's `/^Regulation\s+/i` → `"Reg "`),
///   - `"gen-N"` → `"Gen N"`,
///   - anything else → returned unchanged (web's `return generation` fallback — an
///     already-display-form string passes straight through).
///
/// Structured like ``UncertaintyFlagLabels``: a small pure helper beside the view,
/// pinned by `ScopeTagTests`.
enum ScopeTag {
  /// Current Champions regulation, duplicated from web's `CHAMPIONS_REGULATION`
  /// (`src/data/formats.ts`, `"Regulation M-B"`). Update this alongside
  /// `Format.displayLabel` when it rotates.
  static let championsRegulation = "Regulation M-B"

  /// Map a raw `generation` code to its display tag (see the type doc).
  static func label(for generation: String) -> String {
    if generation == "champions" {
      return "Champions · \(shortRegulation)"
    }
    if generation.hasPrefix("gen-") {
      return "Gen \(generation.dropFirst("gen-".count))"
    }
    return generation
  }

  /// `"Regulation M-B"` → `"Reg M-B"` — the leading `Regulation` word (any casing /
  /// following whitespace) becomes `Reg `, mirroring web's regex replace.
  private static var shortRegulation: String {
    if let range = championsRegulation.range(
      of: "^Regulation\\s+", options: [.regularExpression, .caseInsensitive]
    ) {
      return "Reg " + championsRegulation[range.upperBound...]
    }
    return championsRegulation
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
/// wire `generation` code run through ``ScopeTag/label(for:)`` — e.g. `"gen-9"` →
/// "Gen 9", `"champions"` → "Champions · Reg M-B" — so it reads the same as web's
/// masthead tag; the fallback note and any friendly-labeled uncertainty flags are
/// surfaced by ``CaveatStripView``, not here.
struct ScopeTagView: View {
  let generationBasis: GenerationBasis

  var body: some View {
    let generation = generationBasis.generation
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if generation.isEmpty {
      EmptyView()
    } else {
      let display = ScopeTag.label(for: generation)
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
    // Fallback: the tag stays neutral; the caution belongs to CaveatStripView.
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "gen-1", fallback: true, note: nil)
    )
  }
  .padding()
}
#endif
