import SwiftUI

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
/// generation string as delivered — the fallback note and any friendly-labeled
/// uncertainty flags are surfaced by ``CaveatStripView``, not here.
struct ScopeTagView: View {
  let generationBasis: GenerationBasis

  var body: some View {
    let generation = generationBasis.generation
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if generation.isEmpty {
      EmptyView()
    } else {
      Label {
        Text(generation)
          .fixedSize(horizontal: false, vertical: true)
      } icon: {
        Image(systemName: "tag.fill")
          .accessibilityHidden(true)
      }
      .font(Theme.body(.footnote).weight(.medium))
      .foregroundStyle(Theme.textSecondary)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .oakCard(radius: Theme.Radius.sm)
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Answer scope: \(generation)")
    }
  }
}

#if DEBUG
#Preview {
  VStack(alignment: .leading, spacing: 16) {
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil)
    )
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "Champions · Reg M-B", fallback: false, note: nil)
    )
    // Fallback: the tag stays neutral; the caution belongs to CaveatStripView.
    ScopeTagView(
      generationBasis: GenerationBasis(generation: "Gen 8 (Sword/Shield)", fallback: true, note: nil)
    )
  }
  .padding()
}
#endif
