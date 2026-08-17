import SwiftUI

/// Loads one entity profile for a Dex navigation path entry and renders
/// ``EntityDetailView`` (or loading / miss chrome). Drill-ins call ``onOpen`` so
/// the parent stack can push another ``DexEntityRoute``.
struct DexEntityDetailContainer: View {
  let kind: EntityKind
  let query: String
  let format: Format
  let artifactService: any ArtifactService
  var onOpen: (EntityKind, String) -> Void = { _, _ in }

  @State private var phase: Phase = .loading

  private enum Phase {
    case loading
    case ready(EntityArtifactOk)
    case unavailable(suggestions: [String])
  }

  var body: some View {
    Group {
      switch phase {
      case .loading:
        loadingView
      case .ready(let ok):
        EntityDetailView(artifact: ok, requestFormat: format, onOpen: onOpen)
      case .unavailable(let suggestions):
        missView(suggestions: suggestions)
      }
    }
    .background(Theme.canvas)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: "\(kind.rawValue)|\(query)|\(format.rawValue)") {
      await load()
    }
  }

  private var title: String {
    switch phase {
    case .ready(let ok): return ok.resolved.displayName
    default: return query
    }
  }

  private func load() async {
    phase = .loading
    let result = await artifactService.entity(kind: kind, q: query, format: format)
    switch result {
    case .ok(let ok)?:
      phase = .ready(ok)
    case .notFound(let miss)?:
      phase = .unavailable(suggestions: miss.suggestions)
    default:
      phase = .unavailable(suggestions: [])
    }
  }

  private var loadingView: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
      HStack(alignment: .top, spacing: Theme.Spacing.md + 2) {
        SkeletonBlock(width: 96, height: 96)
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
          SkeletonBlock(width: 150, height: 22)
          SkeletonBlock(width: 80, height: 13)
          HStack(spacing: Theme.Spacing.xs + 2) {
            SkeletonBlock(width: 54, height: 20)
            SkeletonBlock(width: 54, height: 20)
          }
        }
        Spacer(minLength: 0)
      }
      VStack(alignment: .leading, spacing: Theme.Spacing.md) {
        ForEach(0..<6, id: \.self) { _ in
          HStack(spacing: Theme.Spacing.sm) {
            SkeletonBlock(width: 40, height: 12)
            SkeletonBlock(width: 32, height: 12)
            SkeletonBlock(height: 8)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.lg)
    .oakSpecimenPlate(.mechanics)
    .padding(Theme.Spacing.sm)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading")
  }

  private func missView(suggestions: [String]) -> some View {
    ContentUnavailableView {
      Label("Couldn't open \(query)", systemImage: "questionmark.circle")
    } description: {
      Text(
        "Oak doesn't have a \(kind.rawValue) profile for \u{201C}\(query)\u{201D} in this format."
      )
    } actions: {
      if !suggestions.isEmpty {
        VStack(spacing: 8) {
          Text("Did you mean…")
            .font(Theme.body(.caption, weight: .semibold))
            .foregroundStyle(Theme.textSecondary)
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 96), spacing: 8, alignment: .center)],
            spacing: 8
          ) {
            ForEach(Array(suggestions.enumerated()), id: \.offset) { _, suggestion in
              Button {
                onOpen(kind, suggestion)
              } label: {
                Text(suggestion)
                  .font(Theme.body(.caption, weight: .semibold))
                  .foregroundStyle(Theme.accent)
                  .padding(.horizontal, 12)
                  .padding(.vertical, 6)
                  .background(Theme.surfaceRaised, in: Capsule())
              }
              .buttonStyle(OakPressableButtonStyle())
              .accessibilityHint("Opens \(suggestion)")
            }
          }
        }
      }
    }
  }
}
