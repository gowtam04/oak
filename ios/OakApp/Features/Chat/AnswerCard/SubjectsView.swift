import SwiftUI

/// Renders an answer's `subjects[]` — the primary entities the answer is about —
/// as a stack of subject rows (sprite ~72, name 600, mute `#dex` caption, and a
/// fallback flag when the data is pre-Gen-9). Type chips live at the top of the
/// answer plate, not on this row.
///
/// Native mirror of the web `SpriteCard` (`web/src/components/answer-card/
/// SpriteCard.tsx`) for data; Signal drops the type-glow well. `SpriteImage`
/// handles placeholder/failure. Renders **nothing** when there are no subjects.
struct SubjectsView: View {
  let subjects: [Subject]

  var body: some View {
    if !subjects.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(Array(subjects.enumerated()), id: \.offset) { _, subject in
          SubjectCard(subject: subject)
        }
      }
    }
  }
}

// MARK: - One subject

/// A single subject row: sprite ~72, name 600, mute `#dex` caption. Type chips
/// live at the top of the answer plate, not here; no type-glow well.
private struct SubjectCard: View {
  let subject: Subject

  /// The sprite scales with the user's text size so it never looks tiny next to
  /// large Dynamic Type (M-AC-UI1.4 / M-AC-UI9.2); it's an image, so a base point
  /// size is appropriate — `@ScaledMetric` keeps it proportional.
  @ScaledMetric(relativeTo: .body) private var spriteSize: CGFloat = 72

  var body: some View {
    HStack(alignment: .center, spacing: Theme.Spacing.md) {
      SpriteImage(url: URL(string: subject.spriteUrl), name: subject.name, size: spriteSize)
        .allowsHitTesting(false)

      VStack(alignment: .leading, spacing: 2) {
        Text(subject.name)
          .font(Theme.body(.headline, weight: .semibold))
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
        if let dex = subject.dexNumber {
          Text(dexLabel(dex))
            .font(Theme.body(.footnote, weight: .medium))
            .foregroundStyle(Theme.textSecondary)
        }
        if subject.isFallback {
          fallbackPill
            .padding(.top, Theme.Spacing.xs)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }

  // MARK: Fallback flag (icon + text + color — never color alone, M-AC-UI9.3)

  private var fallbackPill: some View {
    Label(fallbackText, systemImage: "clock.arrow.circlepath")
      .font(Theme.display(.caption2))
      .foregroundStyle(Theme.warning)
      .padding(.horizontal, Theme.Spacing.sm)
      .padding(.vertical, Theme.Spacing.xs)
      .background(
        Theme.warning.opacity(0.14),
        in: Capsule()
      )
  }

  // MARK: Helpers

  /// `is_fallback` label text — mirrors the web card: the source generation when
  /// known (e.g. "Gen 8"), else a plain "Fallback".
  private var fallbackText: String {
    subject.sourceGeneration ?? "Fallback"
  }

  /// National Dex number, zero-padded to four digits (e.g. `#0006`).
  private func dexLabel(_ number: Int) -> String {
    String(format: "#%04d", number)
  }

  /// Ordered, spoken description for VoiceOver: name, Dex number, types, fallback.
  private var accessibilityLabel: String {
    var parts: [String] = [subject.name]
    if let dex = subject.dexNumber {
      parts.append("number \(dex)")
    }
    if !subject.types.isEmpty {
      let typeList = subject.types.map { $0.capitalized }.joined(separator: ", ")
      parts.append("\(typeList) type")
    }
    if subject.isFallback {
      let from = subject.sourceGeneration.map { " from \($0)" } ?? ""
      parts.append("fallback data\(from)")
    }
    return parts.joined(separator: ", ")
  }
}

#if DEBUG
#Preview("Subjects") {
  ScrollView {
    SubjectsView(subjects: [
      Subject(
        name: "Garchomp",
        dexNumber: 445,
        spriteUrl: "https://example.invalid/garchomp.png",
        types: ["dragon", "ground"],
        isFallback: false,
        sourceGeneration: nil
      ),
      Subject(
        name: "Stantler",
        dexNumber: 234,
        spriteUrl: "https://example.invalid/stantler.png",
        types: ["normal"],
        isFallback: true,
        sourceGeneration: "Gen 8"
      ),
    ])
    .padding()
  }
}
#endif
