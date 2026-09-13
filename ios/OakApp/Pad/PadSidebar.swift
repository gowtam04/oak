import SwiftUI

/// Enamel leading destination list (P-SHELL-US-1, P-UI-AC-4.3). Calculator is
/// a workspace, not a row (P-SHELL-BR-5).
struct PadSidebar: View {
  enum Style {
    /// Persistent 220 pt labeled list (regular width).
    case expanded
    /// 72 pt icon rail (medium width).
    case rail
  }

  var style: Style
  var selected: OakAppTab?
  var onSelect: (OakAppTab) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      header
      ForEach(OakAppTab.allCases, id: \.self) { tab in
        row(tab)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, style == .rail ? Theme.Spacing.xs : Theme.Spacing.sm)
    .padding(.top, Theme.Spacing.md)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.accent.ignoresSafeArea())
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Destinations")
    .accessibilityIdentifier("pad-sidebar")
  }

  @ViewBuilder
  private var header: some View {
    switch style {
    case .expanded:
      OakWordmarkLockup(tileSize: 32, titleStyle: .headline, elevated: true)
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.bottom, Theme.Spacing.md)
    case .rail:
      OakBrandMark(size: 28)
        .frame(maxWidth: .infinity)
        .padding(.bottom, Theme.Spacing.md)
    }
  }

  private func row(_ tab: OakAppTab) -> some View {
    let isSelected = selected == tab
    return Button {
      onSelect(tab)
    } label: {
      Group {
        switch style {
        case .expanded:
          HStack(spacing: Theme.Spacing.md) {
            Image(systemName: tab.systemImage)
              .font(.system(size: 20, weight: .semibold))
              .frame(width: 28)
            Text(tab.title)
              .font(Theme.display(.body, weight: .semibold))
              .lineLimit(1)
            Spacer(minLength: 0)
          }
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.vertical, Theme.Spacing.md)
        case .rail:
          VStack(spacing: Theme.Spacing.xs) {
            Image(systemName: tab.systemImage)
              .font(.system(size: 20, weight: .semibold))
            Text(tab.title)
              .font(Theme.body(.caption2, weight: .semibold))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, Theme.Spacing.sm)
        }
      }
      .foregroundStyle(isSelected ? Theme.accent : Theme.onRed)
      .background {
        if isSelected {
          RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .fill(Theme.surface)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .hoverEffect(.highlight)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityRemoveTraits(isSelected ? [] : .isSelected)
  }
}

extension OakAppTab {
  var padDestination: PadDestination {
    switch self {
    case .chat: .chat
    case .teams: .teams()
    case .usage: .usage()
    case .dex: .dex()
    case .settings: .settings
    }
  }
}

extension PadDestination {
  /// Sidebar highlight. `nil` while Calculator is open (not a sidebar row).
  var sidebarTab: OakAppTab? {
    switch self {
    case .chat: .chat
    case .teams: .teams
    case .usage: .usage
    case .dex: .dex
    case .settings: .settings
    case .calc: nil
    }
  }
}
