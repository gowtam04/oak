import SwiftUI

/// The prominent caveat banner at the TOP of an answer card — the native mirror of
/// the web `CaveatStrip` (`web/src/components/answer-card/CaveatStrip.tsx`). It
/// combines, into ONE strip, both signals the web card surfaces together:
///
///   1. the generation **fallback** note (`generation_basis.fallback` + its `note`),
///   2. the answer's `uncertainty_flags[]`, each mapped through
///      ``UncertaintyFlagLabels`` so the runtime's internal fallback codes read as
///      plain English (a genuine model-authored caveat renders verbatim).
///
/// Renders **nothing** when there is no fallback and no non-blank flag — exactly the
/// web strip's `!hasFallback && !hasFlags` guard. It sits above the answer body
/// (placement parity with web, which renders it right after the masthead), so any
/// caveat is read before the prose it qualifies.
///
/// Styling is the **solid** warning strip (a triangle icon + the "Uncertainty" label
/// + the text, never color alone — M-AC-UI9.3), reflowing under Dynamic Type and
/// adapting to light/dark from `Theme`.
struct CaveatStripView: View {
  let uncertaintyFlags: [String]?
  let generationBasis: GenerationBasis

  /// Non-blank flags, trimmed — a stray `""` never renders an empty caveat row.
  private var flags: [String] {
    (uncertaintyFlags ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  private var hasFallback: Bool { generationBasis.fallback }
  private var hasFlags: Bool { !flags.isEmpty }

  /// The fallback line: the model's `note` when present, else the web default
  /// message (`CaveatStrip.tsx`: `note ?? \`Based on ${generation} data — this
  /// Pokémon is not in Gen 9.\``).
  private var fallbackLine: String {
    let note = generationBasis.note?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let note, !note.isEmpty { return note }
    let generation = generationBasis.generation.trimmingCharacters(in: .whitespacesAndNewlines)
    let base = generation.isEmpty ? "an earlier generation" : generation
    return "Based on \(base) data — this Pokémon is not in Gen 9."
  }

  var body: some View {
    if hasFallback || hasFlags {
      VStack(alignment: .leading, spacing: 10) {
        Label("Uncertainty", systemImage: "exclamationmark.triangle.fill")
          .font(Theme.display(.subheadline))
          .foregroundStyle(Theme.warning)
          .accessibilityLabel("Uncertainty — things to keep in mind")

        if hasFallback {
          row(fallbackLine)
        }
        ForEach(Array(flags.enumerated()), id: \.offset) { _, flag in
          row(UncertaintyFlagLabels.label(for: flag))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .oakCard(radius: Theme.Radius.md, tint: Theme.warning)
      // SOLID border (vs. the inferences' dashed edge) — the visual tell that
      // these are caveats, not deductions.
      .overlay(
        RoundedRectangle(cornerRadius: Theme.Radius.md)
          .strokeBorder(Theme.warning.opacity(0.5), lineWidth: 1)
      )
    }
  }

  /// One caveat: a leading triangle glyph + the caveat text. The icon repeats the
  /// caution so the tint is reinforcement, never the sole signal (M-AC-UI9.3).
  private func row(_ text: String) -> some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
        .imageScale(.small)
        .foregroundStyle(Theme.warning)
        .accessibilityHidden(true)

      Text(text)
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textPrimary)
        .fixedSize(horizontal: false, vertical: true)

      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Caveat: \(text)")
  }
}

#if DEBUG
#Preview("Flags + fallback") {
  CaveatStripView(
    uncertaintyFlags: [
      "Damage roll is an estimate — exact EV investment of the opponent is unknown.",
      "max_iterations_reached",
    ],
    generationBasis: GenerationBasis(
      generation: "Gen 8 (Sword/Shield)",
      fallback: true,
      note: nil
    )
  )
  .padding()
}

#Preview("Flags only") {
  CaveatStripView(
    uncertaintyFlags: ["Result assumes the standard Rough Skin ability."],
    generationBasis: GenerationBasis(generation: "Gen 9", fallback: false, note: nil)
  )
  .padding()
}

#Preview("Clean (renders nothing)") {
  CaveatStripView(
    uncertaintyFlags: nil,
    generationBasis: GenerationBasis(generation: "Gen 9", fallback: false, note: nil)
  )
  .padding()
}
#endif
