import SwiftUI

/// Renders an answer's `inferences[]` — claims Oak *deduced* rather than read
/// directly from data (BR-3 / M-AC-1.2). Each row shows the claim, a confidence
/// level (`high`/`medium`/`low`), and an optional note on what the deduction
/// hinges on.
///
/// Styling mirrors the web `InferenceCallout`: a soft azure fill with a **dashed**
/// azure border — the dashed edge is the visual signal for "inferred, not cited",
/// keeping it distinct from the solid uncertainty caveat strip. Confidence is
/// carried by an icon (a fill-level meter) **and** a text label, not color alone
/// (M-AC-UI9.3); colors and type ramp adapt to light/dark + Dynamic Type and wrap
/// rather than clip at large sizes (M-AC-1.4, M-UI-US-9).
///
/// Renders nothing when there are no inferences.
struct InferencesView: View {
  let inferences: [Inference]

  var body: some View {
    if !inferences.isEmpty {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        Text(inferenceHeader)
          .instrumentLabel()
          .foregroundStyle(Theme.azure)
          .accessibilityLabel("Oak's deductions — not directly cited")

        ForEach(Array(inferences.enumerated()), id: \.offset) { _, inference in
          row(inference)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.md)
      .oakCard(radius: Theme.Radius.md, tint: Theme.azure)
      // A solid hairline distinguishes "inferred, not cited" from cited blocks —
      // dashed replaced with a solid azure hairline (strategy §4.04 item 7).
      .overlay(
        RoundedRectangle(cornerRadius: Theme.Radius.md)
          .strokeBorder(Theme.azure.opacity(0.35), lineWidth: 1)
      )
    }
  }

  /// Header label — "OAK'S DEDUCTIONS · SOLID" when there is exactly one inference
  /// with a known confidence level; "OAK'S DEDUCTIONS" otherwise. (`.instrumentLabel()`
  /// uppercases the rendered text; this returns natural case.)
  private var inferenceHeader: String {
    if inferences.count == 1, let first = inferences.first {
      return "Oak's deductions · \(first.confidence.label)"
    }
    return "Oak's deductions"
  }

  /// One inference: a leading confidence badge, the claim, and an optional note.
  @ViewBuilder
  private func row(_ inference: Inference) -> some View {
    let confidence = inference.confidence

    HStack(alignment: .top, spacing: Theme.Spacing.sm) {
      confidenceBadge(confidence)

      VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
        Text(inference.claim)
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)

        if let note = inference.note, !note.isEmpty {
          Text(note)
            .font(Theme.body(.footnote))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel(for: inference))
  }

  /// A capsule pairing the confidence's fill-level icon with its label — the icon
  /// + word carry the level so color is never the sole signal (M-AC-UI9.3).
  private func confidenceBadge(_ confidence: Inference.Confidence) -> some View {
    Label {
      Text(confidence.label.uppercased())
        .font(Theme.body(.caption2, weight: .semibold))
    } icon: {
      Image(systemName: confidence.systemImage)
        .imageScale(.small)
    }
    .foregroundStyle(confidence.tint)
    .padding(.horizontal, Theme.Spacing.sm)
    .padding(.vertical, Theme.Spacing.xs)
    .background(confidence.tint.opacity(0.15), in: Capsule())
  }

  private func accessibilityLabel(for inference: Inference) -> String {
    var label = "\(inference.confidence.label) confidence inference: \(inference.claim)"
    if let note = inference.note, !note.isEmpty {
      label += ". \(note)"
    }
    return label
  }
}

/// Presentation mapping for an inference's confidence level. A fill-level icon
/// (full / half / empty circle) plus a text label communicate the level so the
/// hue is reinforcement, not the only cue (M-AC-UI9.3).
private extension Inference.Confidence {
  var label: String {
    switch self {
    case .high: return "Solid"
    case .medium: return "Likely"
    case .low: return "Unsure"
    // An unrecognized confidence value (the wire can widen): render the raw string
    // verbatim rather than failing the decode or hiding the inference.
    case let .unknown(raw): return raw
    }
  }

  var systemImage: String {
    switch self {
    case .high: return "circle.fill"
    case .medium: return "circle.bottomhalf.filled"
    case .low: return "circle"
    case .unknown: return "circle.dotted"
    }
  }

  var tint: Color {
    switch self {
    case .high: return Theme.success
    case .medium: return Theme.warning
    case .low: return Theme.textMuted
    case .unknown: return Theme.textMuted
    }
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
      .init(
        claim: "This spread may outspeed neutral-nature base 100s at +1.",
        confidence: .low,
        note: "Exact EV investment of the opponent is unknown."
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
