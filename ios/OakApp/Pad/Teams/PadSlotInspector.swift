import SwiftUI

/// One-slot inspector: the same competitive-set fields as iPhone `TeamEditorView`
/// for a single canvas slot, including Stat Points and warn-but-allow (P-TEAM-AC-2.6–2.7).
struct PadSlotInspector: View {
  var model: TeamEditorViewModel
  var slotIndex: Int

  var body: some View {
    @Bindable var model = model
    Form {
      if model.isLoading && model.members.isEmpty {
        Section {
          ForEach(0..<4, id: \.self) { _ in
            SkeletonListRow()
              .listRowInsets(EdgeInsets())
              .listRowBackground(Color.clear)
          }
        }
      } else if model.members.indices.contains(slotIndex) {
        let member = model.members[slotIndex]
        PadMemberSetEditor(
          index: slotIndex,
          member: $model.members[slotIndex],
          warnings: model.warnings(forSlot: slotIndex),
          spriteRef: model.spriteRef(for: member.species),
          abilityOptions: model.abilityOptions(for: member.species),
          movepoolOptions: model.movepoolOptions(for: member.id),
          search: model.searchEntities,
          isReadOnly: model.isReadOnly,
          showsTeraField: model.showsTeraField,
          showsIVKnobs: model.showsIVKnobs,
          showsLevelKnob: model.showsLevelKnob,
          showsStatPoints: model.showsStatPoints,
          statPointBudget: model.statPointBudget,
          statPointStatCap: model.statPointStatCap,
          onSpeciesChange: {
            Task {
              await model.refreshSprites()
              await model.refreshMovepool(for: member.id)
            }
          },
          onRemove: { model.removeMember(at: slotIndex) }
        )
      } else {
        Section {
          Text("Select a slot on the canvas to edit its set.")
            .font(Theme.body(.subheadline))
            .foregroundStyle(Theme.textSecondary)
            .listRowBackground(Color.clear)
        }
      }

      if !model.teamLevelWarnings.isEmpty {
        Section("Team legality") {
          ForEach(Array(model.teamLevelWarnings.enumerated()), id: \.offset) { _, warning in
            PadSlotWarningRow(warning: warning)
          }
        }
      }

      TeamAnalysisSection(model: model)
    }
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .listRowBackground(Theme.surface)
    .onChange(of: model.members) { _, _ in
      model.scheduleAnalysis()
      model.scheduleSave()
    }
    .overlay(alignment: .bottom) {
      if let message = model.errorMessage {
        ErrorBanner(message: message, onDismiss: { model.dismissError() })
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.bottom, Theme.Spacing.sm)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-slot-inspector")
  }
}

// MARK: - One member set (copied from TeamEditorView; iPhone file is not in Own)

private struct PadMemberSetEditor: View {
  let index: Int
  @Binding var member: EditableMember
  let warnings: [TeamWarning]
  let spriteRef: DexSpriteRef?
  let abilityOptions: [PickerOption]
  let movepoolOptions: [PickerOption]
  let search: (EntityKind, String) async -> [PickerOption]
  let isReadOnly: Bool
  let showsTeraField: Bool
  let showsIVKnobs: Bool
  let showsLevelKnob: Bool
  let showsStatPoints: Bool
  let statPointBudget: Int
  let statPointStatCap: Int
  let onSpeciesChange: () -> Void
  let onRemove: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var requiredItem: String? {
    let stone = spriteRef?.requiredItem
    return (stone?.isEmpty ?? true) ? nil : stone
  }

  var body: some View {
    Section {
      VStack(alignment: .leading, spacing: 16) {
        identityHeader
        identityFields
        moveFields
        naturePicker
        if showsTeraField {
          teraPicker
        }
        if showsLevelKnob {
          Stepper(value: $member.level, in: 1...100) {
            LabeledContent("Level", value: "\(member.level)")
          }
        } else if isReadOnly {
          LabeledContent("Level", value: "\(member.level)")
        } else {
          LabeledContent("Level", value: "50")
        }
        PadStatStepperGrid(
          title: showsStatPoints ? "Stat Points" : "EVs",
          spread: $member.evs,
          range: showsStatPoints ? 0...statPointStatCap : 0...252,
          step: showsStatPoints ? 1 : 4,
          footnote: evFootnote
        )
        .disabled(isReadOnly)
        if showsIVKnobs {
          PadStatStepperGrid(
            title: "IVs",
            spread: $member.ivs,
            range: 0...31,
            step: 1
          )
        }
        cosmeticFields

        if !warnings.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(warnings.enumerated()), id: \.offset) { _, warning in
              PadSlotWarningRow(warning: warning)
            }
          }
          .animation(reduceMotion ? nil : Theme.Motion.smooth, value: warnings)
        }
      }
      .padding(16)
      .oakCard(
        radius: Theme.Radius.md,
        tint: spriteRef?.types.first.map { Theme.type($0) }
      )
      .overlay {
        if let primary = spriteRef?.types.first {
          RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Theme.type(primary).opacity(0.30), lineWidth: 1.5)
        }
      }
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
    } header: {
      HStack {
        Text(headerTitle)
        Spacer()
        if !isReadOnly {
          Button(role: .destructive, action: onRemove) {
            Label("Remove", systemImage: "trash")
              .labelStyle(.iconOnly)
          }
          .accessibilityLabel("Remove Pokémon \(index + 1)")
        }
      }
    }
    .onChange(of: member.species) { _, _ in onSpeciesChange() }
    .disabled(isReadOnly)
  }

  private var headerTitle: String {
    let species = member.species.trimmingCharacters(in: .whitespacesAndNewlines)
    if species.isEmpty { return "Pokémon \(index + 1)" }
    return spriteRef?.displayName ?? TeamBlocksView.titleizeNonNil(species)
  }

  @ViewBuilder
  private var identityHeader: some View {
    if !member.species.isEmpty {
      HStack(spacing: 12) {
        identitySprite
        VStack(alignment: .leading, spacing: 4) {
          Text(headerTitle)
            .font(Theme.body(.headline))
          if let types = spriteRef?.types, !types.isEmpty {
            HStack(spacing: 6) {
              ForEach(types, id: \.self) { TypeBadge(type: $0) }
            }
          }
          if isOffRoster(field: "species") {
            Text("not in the Champions roster")
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.warning)
          }
        }
        Spacer(minLength: 0)
      }
    }
  }

  private var identitySprite: some View {
    let primary = spriteRef?.types.first
    let secondary = (spriteRef?.types.count ?? 0) > 1 ? spriteRef?.types[1] : nil
    return SpriteImage(urlString: spriteRef?.spriteUrl, name: headerTitle, size: 48)
      .padding(6)
      .modifier(PadSlotTypeEdge(primary: primary, secondary: secondary))
  }

  @ViewBuilder
  private var identityFields: some View {
    EntityPickerRow(
      title: "Species",
      value: member.species,
      source: .search(.pokemon),
      placeholder: "Search Pokémon…",
      displayName: { _ in headerTitle },
      search: search,
      onChange: { member.species = $0 }
    )
    offRosterNote(field: "species")
    EntityPickerRow(
      title: "Ability",
      value: member.ability,
      source: .options(abilityOptions),
      placeholder: member.species.isEmpty ? "Select a species first" : "Search abilities…",
      disabled: member.species.isEmpty,
      search: search,
      onChange: { member.ability = $0 }
    )
    offRosterNote(field: "ability")
    EntityPickerRow(
      title: requiredItem != nil ? "Item (Mega stone)" : "Item",
      value: member.item,
      source: .search(.item),
      placeholder: "Search items…",
      disabled: requiredItem != nil,
      search: search,
      onChange: { member.item = $0 }
    )
    offRosterNote(field: "item")
  }

  @ViewBuilder
  private var moveFields: some View {
    ForEach(0..<4, id: \.self) { moveIndex in
      PadMoveFieldRow(
        title: "Move \(moveIndex + 1)",
        value: moveBinding(moveIndex),
        movepool: movepoolOptions,
        disabled: member.species.isEmpty,
        placeholder: member.species.isEmpty ? "Select a species first" : "Move \(moveIndex + 1)",
        search: search
      )
    }
  }

  private func moveBinding(_ index: Int) -> Binding<String> {
    Binding(
      get: { member.moves.indices.contains(index) ? member.moves[index] : "" },
      set: { newValue in
        if member.moves.indices.contains(index) { member.moves[index] = newValue }
      }
    )
  }

  private var naturePicker: some View {
    Picker("Nature", selection: $member.nature) {
      Text("None").tag("")
      ForEach(TeamEditorViewModel.natures, id: \.self) { nature in
        Text(TeamBlocksView.titleizeNonNil(nature)).tag(nature)
      }
    }
  }

  private var teraPicker: some View {
    Picker("Tera type", selection: $member.teraType) {
      Text("None").tag("")
      ForEach(TeamEditorViewModel.teraTypes, id: \.self) { type in
        Text(TeamBlocksView.titleizeNonNil(type)).tag(type)
      }
    }
  }

  @ViewBuilder
  private var cosmeticFields: some View {
    LabeledContent("Nickname") {
      TextField("Nickname", text: $member.nickname)
        .multilineTextAlignment(.trailing)
        .textInputAutocapitalization(.words)
    }
    Picker("Gender", selection: $member.gender) {
      Text("Unspecified").tag(TeamMember.Gender?.none)
      Text("Male").tag(TeamMember.Gender?.some(.male))
      Text("Female").tag(TeamMember.Gender?.some(.female))
      Text("Genderless").tag(TeamMember.Gender?.some(.neutral))
    }
    Toggle("Shiny", isOn: $member.shiny)
  }

  @ViewBuilder
  private func offRosterNote(field: String) -> some View {
    if isOffRoster(field: field) {
      Text("not in the Champions roster")
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.warning)
    }
  }

  private func isOffRoster(field: String) -> Bool {
    guard isReadOnly else { return false }
    if warnings.contains(where: { warning in
      let matchesField =
        warning.field == field
        || (field == "species"
          && (warning.field == nil || warning.code == .speciesIllegal))
      return matchesField
        && (warning.code == .speciesIllegal
          || warning.message.localizedCaseInsensitiveContains("not in the Champions roster"))
    }) {
      return true
    }
    if field == "species", !member.species.isEmpty, spriteRef == nil { return true }
    if field != "species", isOffRoster(field: "species") {
      switch field {
      case "ability": return !member.ability.isEmpty
      case "item": return !member.item.isEmpty
      default: return false
      }
    }
    return false
  }

  private var evFootnote: String {
    let total = member.evs.total
    let budget = showsStatPoints ? statPointBudget : 508
    if total > budget {
      return "Total \(total) / \(budget) — over the legal budget (saved anyway)."
    }
    return "Total \(total) / \(budget)"
  }
}

private struct PadMoveFieldRow: View {
  let title: String
  @Binding var value: String
  let movepool: [PickerOption]
  let disabled: Bool
  let placeholder: String
  let search: (EntityKind, String) async -> [PickerOption]

  private var selectedHint: String? {
    movepool.first { $0.slug == value }?.hint
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      EntityPickerRow(
        title: title,
        value: value,
        source: .options(movepool),
        placeholder: placeholder,
        disabled: disabled,
        search: search,
        onChange: { value = $0 }
      )
      if let selectedHint {
        Text(selectedHint)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
          .padding(.leading, 4)
      }
    }
  }
}

private struct PadStatStepperGrid: View {
  let title: String
  @Binding var spread: EditableStatSpread
  let range: ClosedRange<Int>
  let step: Int
  var footnote: String?

  var body: some View {
    DisclosureGroup(title) {
      statRow("HP", value: $spread.hp)
      statRow("Attack", value: $spread.atk)
      statRow("Defense", value: $spread.def)
      statRow("Sp. Atk", value: $spread.spa)
      statRow("Sp. Def", value: $spread.spd)
      statRow("Speed", value: $spread.spe)
      if let footnote {
        Text(footnote)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    }
  }

  private func statRow(_ label: String, value: Binding<Int>) -> some View {
    Stepper(value: value, in: range, step: step) {
      LabeledContent(label) {
        Text("\(value.wrappedValue)")
          .font(Theme.mono(.body))
          .monospacedDigit()
      }
    }
  }
}

private struct PadSlotWarningRow: View {
  let warning: TeamWarning

  var body: some View {
    Label {
      Text(warning.message)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    } icon: {
      Image(systemName: isInfo ? "info.circle" : "exclamationmark.triangle.fill")
        .foregroundStyle(accent)
        .accessibilityHidden(true)
    }
    .padding(Theme.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(softFill, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .overlay(alignment: .leading) { Rectangle().fill(accent).frame(width: 3) }
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(isInfo ? "Note" : "Caution"): \(warning.message)")
  }

  private var isInfo: Bool { warning.code == .incomplete }
  private var accent: Color { isInfo ? Theme.azure : Theme.warning }
  private var softFill: Color { isInfo ? Theme.azureSoft : Theme.warningSoft }
}

private struct PadSlotTypeEdge: ViewModifier {
  let primary: String?
  let secondary: String?

  func body(content: Content) -> some View {
    if let primary {
      content.oakTypeGlowWell(
        primary: primary,
        secondary: secondary,
        cornerRadius: Theme.Radius.md,
        glowEndRadius: 36
      )
    } else {
      content
        .overlay {
          RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Theme.border, lineWidth: 1)
        }
    }
  }
}
