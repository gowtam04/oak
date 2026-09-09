import SwiftUI

/// Renders an answer's `inferences[]` as an azure-soft callout with a dashed
/// azure border (Enamel & Paper `.inference-callout`).
///
/// Only the word **Inferred** is `Theme.azure` 600. The rest of the sentence
/// is mute. When a `note` is present it is the short reason (`Inferred from
/// {note}.`); otherwise the claim follows an em dash.
///
/// Renders nothing when there are no inferences.
struct InferencesView: View {
  let inferences: [Inference]

  var body: some View {
    if !inferences.isEmpty {
      VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
        ForEach(Array(inferences.enumerated()), id: \.offset) { _, inference in
          inferredLine(inference)
        }
      }
      .padding(Theme.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        Theme.azureSoft,
        in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(
            Theme.azure,
            style: StrokeStyle(lineWidth: 1, dash: [4, 3])
          )
      }
    }
  }

  private func inferredLine(_ inference: Inference) -> some View {
    let note = inference.note?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let hasNote = note.map { !$0.isEmpty } ?? false
    let rest: String = {
      if hasNote, let note {
        return " from \(trimmedPeriod(note))."
      }
      return " — \(trimmedPeriod(inference.claim))."
    }()

    return (
      Text("Inferred")
        .font(Theme.body(.subheadline, weight: .semibold))
        .foregroundStyle(Theme.azure)
      + Text(rest)
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
    )
    .fixedSize(horizontal: false, vertical: true)
    .accessibilityLabel(hasNote
      ? "Inferred from \(note ?? "")"
      : "Inferred: \(inference.claim)")
  }

  /// Drop a trailing period so we can always terminate the sentence ourselves.
  private func trimmedPeriod(_ value: String) -> String {
    var trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    while trimmed.hasSuffix(".") {
      trimmed.removeLast()
    }
    return trimmed
  }
}

#if DEBUG
#Preview("Inferences") {
  InferencesView(
    inferences: [
      .init(
        claim: "Fake Out fails against Farigiraf because Inner Focus prevents flinching.",
        confidence: .high,
        note: "Inner Focus is one of Farigiraf's listed abilities."
      ),
      .init(
        claim: "Trick Room likely benefits this slow team more than fast leads.",
        confidence: .medium,
        note: nil
      ),
    ]
  )
  .padding()
}

#Preview("Empty (renders nothing)") {
  InferencesView(inferences: [])
    .padding()
}
#endif
