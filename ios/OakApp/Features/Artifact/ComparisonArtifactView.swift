import SwiftUI

/// Renders a **comparison** artifact — a side-by-side of the answer's `subjects[]`,
/// the native mirror of the web `ComparisonArtifact`
/// (`web/src/components/artifact/ComparisonArtifact.tsx`). Like web, it is derived
/// from the committed answer payload (no fetch, M-AC-A4.1) and simply lays the
/// subjects out together, reusing the exact ``SubjectsView`` sprite-card the answer
/// itself renders — so the sprites, dex numbers, type badges, and any fallback pill
/// stay identical to the answer.
///
/// Web stacks the cards in a wrapping flex row; on the phone's bottom sheet that
/// reflows to a single readable column. Each card is tappable to drill into that
/// Pokémon's full profile (web's `SpriteCard` is itself clickable — AV-US-5),
/// pushing a new artifact onto the viewer's back stack via ``onOpen``.
struct ComparisonArtifactView: View {
  let subjects: [Subject]
  var diff: PokemonCompareDiff? = nil

  /// Pushes a Pokémon's full profile when its comparison card is tapped. No-op
  /// default so the view renders in isolation / previews.
  var onOpen: (String) -> Void = { _ in }

  /// Multi-subject plate (or single-typed / mechanics) — specimen continuation
  /// of the answer card (soul.md Phase 2.1).
  private var plateAtmosphere: Theme.PlateAtmosphere {
    Theme.PlateAtmosphere.resolve(subjectTypes: subjects.map(\.types))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        ForEach(Array(subjects.enumerated()), id: \.offset) { _, subject in
          VStack(alignment: .leading, spacing: 6) {
            Button {
              onOpen(subject.name)
            } label: {
              SubjectsView(subjects: [subject])
            }
            .buttonStyle(OakPressableButtonStyle())
            .accessibilityHint("Opens \(subject.name)'s full profile")
            AddToTeamButton(incoming: incomingTeamMember(species: subject.name), compact: true)
          }
        }
        if let diff {
          compareDiffSection(diff)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.lg)
      .oakSpecimenPlate(plateAtmosphere, showsLeadingEdge: false)
      .padding(.horizontal, Theme.Spacing.sm)
      .padding(.vertical, Theme.Spacing.sm)
    }
    .background(Theme.canvas)
  }

  @ViewBuilder
  private func compareDiffSection(_ diff: PokemonCompareDiff) -> some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("Compare")
        .font(Theme.display(.subheadline))
      Text("\(diff.left.displayName) (\(diff.left.format.shortLabel)) vs \(diff.right.displayName) (\(diff.right.format.shortLabel))")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
      diffLine("Speed", "\(diff.speed.leftValue) vs \(diff.speed.rightValue)")
      setLine("Types", diff.types)
      setLine("Abilities", diff.abilities)
      setLine("Movepool", diff.movepool)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.md)
    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Comparison of \(diff.left.displayName) and \(diff.right.displayName)")
  }

  private func diffLine(_ title: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title).font(Theme.body(.caption, weight: .semibold))
      Text(value).font(Theme.body(.footnote)).foregroundStyle(Theme.textSecondary)
    }
  }

  private func setLine(_ title: String, _ set: PokemonCompareSetDiff) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title).font(Theme.body(.caption, weight: .semibold))
      if !set.onlyLeft.isEmpty {
        Text("Only left: \(set.onlyLeft.joined(separator: ", "))")
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
      if !set.onlyRight.isEmpty {
        Text("Only right: \(set.onlyRight.joined(separator: ", "))")
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
      if !set.shared.isEmpty {
        Text("Shared: \(set.shared.prefix(8).joined(separator: ", "))")
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    }
  }
}

#if DEBUG
#Preview("Comparison") {
  ComparisonArtifactView(subjects: [
    Subject(
      name: "Garchomp", dexNumber: 445,
      spriteUrl: "https://example.invalid/garchomp.png",
      types: ["dragon", "ground"], isFallback: false, sourceGeneration: nil
    ),
    Subject(
      name: "Dragapult", dexNumber: 887,
      spriteUrl: "https://example.invalid/dragapult.png",
      types: ["dragon", "ghost"], isFallback: false, sourceGeneration: nil
    ),
  ])
}
#endif
