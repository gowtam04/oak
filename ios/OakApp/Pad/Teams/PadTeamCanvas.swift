import SwiftUI

/// Six-slot team canvas (P-TEAM-AC-2.1–2.2). Empty slots are selectable so they
/// can be filled. Slot identity matches the iPhone roster: sprite, name, item.
struct PadTeamCanvas: View {
  var model: TeamEditorViewModel
  var selectedSlot: Int
  var stacked: Bool
  var showsLibraryButton: Bool = false
  /// Compact Destinations overlay (PadRootView) — Chat uses 56pt leading.
  var headerLeadingInset: CGFloat = Theme.Spacing.md
  /// Companion reveal overlay — 56pt trailing whenever that control is shown.
  var headerTrailingInset: CGFloat = Theme.Spacing.md
  var onPresentLibrary: (() -> Void)? = nil
  var onSelectSlot: (Int) -> Void
  var onAssistant: () -> Void
  var onExport: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      header
      if model.isLoading && model.members.isEmpty {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        slotGrid
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.bottom, Theme.Spacing.md)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.canvas)
    .onChange(of: model.name) { _, _ in
      model.scheduleSave()
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-team-canvas")
  }

  private var header: some View {
    let bound = Bindable(model)
    return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
      HStack(spacing: Theme.Spacing.sm) {
        if showsLibraryButton {
          Button {
            onPresentLibrary?()
          } label: {
            Image(systemName: "sidebar.leading")
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Theme.accent)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Team library")
        }
        TextField("Team name", text: bound.name)
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textPrimary)
          .textInputAutocapitalization(.words)
          .disabled(model.isReadOnly)
          .accessibilityLabel("Team name")
        if model.isSaving {
          ProgressView()
            .tint(Theme.accent)
            .accessibilityLabel("Saving")
        }
        if !model.isReadOnly {
          Button(action: onAssistant) {
            Label("Team assistant", systemImage: "sparkles")
              .labelStyle(.iconOnly)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Theme.accent)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Team assistant")
          .accessibilityIdentifier("pad-teams-assistant")
        }
        if model.teamId != nil {
          Button(action: onExport) {
            Label("Export", systemImage: "square.and.arrow.up")
              .labelStyle(.iconOnly)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Theme.accent)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Export")
        }
      }
      HStack(spacing: Theme.Spacing.sm) {
        Text(model.format.displayLabel)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
        if model.isReadOnly {
          Text("Archived — view and delete only")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
        }
        if model.showSaveConfirmation {
          Label("Saved", systemImage: "checkmark.circle.fill")
            .font(Theme.body(.caption, weight: .semibold))
            .foregroundStyle(Theme.success)
        }
        Spacer(minLength: 0)
      }
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, headerTrailingInset)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.sm)
  }

  private var slotGrid: some View {
    let columns = Array(
      repeating: GridItem(.flexible(), spacing: Theme.Spacing.sm),
      count: stacked ? 3 : 2
    )
    return LazyVGrid(columns: columns, spacing: Theme.Spacing.sm) {
      ForEach(0..<PadTeamsChrome.slotCount, id: \.self) { index in
        slotCard(index)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }

  private func slotCard(_ index: Int) -> some View {
    let member = index < model.members.count ? model.members[index] : nil
    let selected = index == selectedSlot
    let warnings = model.warnings(forSlot: index)
    let species = member?.species ?? ""
    let ref = species.isEmpty ? nil : model.spriteRef(for: species)
    let name = slotLabel(member: member, index: index, ref: ref)
    let item = member?.item ?? ""
    return Button {
      Haptics.tap()
      onSelectSlot(index)
    } label: {
      VStack(spacing: 6) {
        SpriteImage(urlString: ref?.spriteUrl, name: name, size: stacked ? 40 : 52)
          .padding(6)
          .background(
            Theme.surfaceSunken,
            in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          )
        Text(name)
          .font(Theme.body(.caption, weight: selected ? .semibold : .regular))
          .foregroundStyle(selected ? Theme.accent : Theme.textPrimary)
          .lineLimit(1)
        Text(itemLabel(item))
          .font(Theme.body(.caption2))
          .foregroundStyle(Theme.textSecondary)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, Theme.Spacing.sm)
      .padding(.horizontal, Theme.Spacing.xs)
      .background(Theme.surface)
      .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(selected ? Theme.accent : Theme.border, lineWidth: selected ? 2 : 1)
      }
      .overlay(alignment: .topTrailing) {
        if !warnings.isEmpty {
          Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: 12))
            .foregroundStyle(Theme.warning)
            .padding(6)
            .accessibilityHidden(true)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(slotAccessibility(name: name, index: index, warnings: warnings))
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    .accessibilityIdentifier("pad-team-slot-\(index)")
  }

  private func slotLabel(member: EditableMember?, index: Int, ref: DexSpriteRef?) -> String {
    guard let member, !member.species.isEmpty else { return "Slot \(index + 1)" }
    return ref?.displayName ?? TeamBlocksView.titleizeNonNil(member.species)
  }

  private func itemLabel(_ item: String) -> String {
    let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "No item" : TeamBlocksView.titleizeNonNil(trimmed)
  }

  private func slotAccessibility(name: String, index: Int, warnings: [TeamWarning]) -> String {
    var parts = [name, "slot \(index + 1)"]
    if !warnings.isEmpty { parts.append("has warnings") }
    return parts.joined(separator: ", ")
  }
}
