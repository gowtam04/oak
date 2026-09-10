import SwiftUI
import UIKit

/// The full-set team editor (history-and-teams.md M-TEAM-US-1/3; M-UI-US-5): a native
/// `Form` for naming a team and filling each member's complete competitive set —
/// species / ability / item / four moves / nature / EVs / IVs / Tera / level — with
/// pickers and steppers so the whole set is editable on a phone (M-AC-T1.3).
///
/// Species / ability / item / move fields are search-driven ``EntityPickerRow``s (a native
/// sheet stands in for web's inline `EntityPicker.tsx` dropdown): species and item search
/// `/api/search` live; ability offers only the resolved species' legal abilities; moves
/// offer only the species' fetched learnset (`/api/learnset`) — exactly mirroring
/// `TeamMemberPanel.tsx`'s two suggestion sources. A ``RosterStripView`` up top shows
/// batch-resolved sprites (`/api/sprites`) and scrolls to a tapped slot; long-press then
/// drag reorders the draft (the member list below follows on drop). A Mega's stone is
/// auto-forced onto its held item once resolved (mirrors `TeamEditor.tsx`).
///
/// **Warn-but-allow** (M-AC-T3.1 / M-BR-T3): the server's legality/validity warnings are
/// rendered inline (per slot and team-level) but **Save is never disabled** — an EV total
/// over 508, a move outside the learnset, etc. all still save, clearly flagged. Export to
/// Showdown text is offered via the native share sheet (M-AC-T2.3).
struct TeamEditorView: View {
  @State private var model: TeamEditorViewModel
  @State private var exportedPaste: ExportPayload?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.services) private var services

  /// The team-builder assistant's lifetime holder — created lazily on first open (it needs
  /// the injected service + a reference to this editor's live draft) and then kept for the
  /// editor's lifetime, so its in-memory thread survives sheet dismiss/reopen. This is
  /// deliberately separate from ``presentedAssistant``: SwiftUI nils an `.sheet(item:)`
  /// binding on dismiss, so presenting straight off this property would destroy the thread
  /// every time the sheet closes.
  @State private var assistant: TeamsAssistantViewModel?

  /// The sole driver of the assistant sheet via `.sheet(item:)` — non-nil presents, so a
  /// blank/nil-model sheet is impossible. Dismiss nils only this binding; ``assistant``
  /// itself is untouched, which is what keeps the thread alive across reopens.
  @State private var presentedAssistant: TeamsAssistantViewModel?

  /// `true` for a brief window right after a successful save — drives the
  /// transient "Saved" checkmark overlay (self-clearing after ~1s).
  @State private var showSaveConfirmation = false

  /// Roster strip selection — 2px poke-red ring on the focused party slot.
  @State private var selectedRosterIndex = 0

  /// `true` while a roster-strip reorder drag is in flight — disables Form
  /// scrolling so the nested horizontal strip can own the gesture.
  @State private var isReorderingRoster = false

  /// When `true`, the editor fetches the full team on appear (existing-team path).
  private let loadsOnAppear: Bool

  init(model: TeamEditorViewModel, loadsOnAppear: Bool = false) {
    _model = State(initialValue: model)
    self.loadsOnAppear = loadsOnAppear
  }

  var body: some View {
    @Bindable var model = model
    ScrollViewReader { proxy in
      Form {
        if loadsOnAppear && model.isLoading && model.members.isEmpty {
          Section {
            ForEach(0..<4, id: \.self) { i in
              SkeletonListRow()
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .id("skeleton-\(i)")
            }
          }
        } else {
          if !model.members.isEmpty {
            Section {
              RosterStripView(
                members: model.members,
                spriteRefs: model.spriteRefsBySpecies,
                selectedIndex: selectedRosterIndex,
                canReorder: !model.isReadOnly && model.members.count > 1,
                isReordering: $isReorderingRoster,
                onSelect: { index in
                  selectedRosterIndex = index
                  withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
                    proxy.scrollTo(model.members[index].id, anchor: .top)
                  }
                },
                onMove: { from, to in
                  guard model.members.indices.contains(from) else { return }
                  let movedId = model.members[from].id
                  withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
                    model.moveMember(from: from, to: to)
                    if let newIndex = model.members.firstIndex(where: { $0.id == movedId }) {
                      selectedRosterIndex = newIndex
                    }
                  }
                  withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
                    proxy.scrollTo(movedId, anchor: .top)
                  }
                }
              )
              .listRowInsets(EdgeInsets())
              .listRowBackground(Color.clear)
            }
          }

          Section("Team") {
            TextField("Team name", text: $model.name)
              .textInputAutocapitalization(.words)
              .disabled(model.isReadOnly)
            LabeledContent("Format", value: model.format.displayLabel)
            if model.isReadOnly {
              Text("Archived — view and delete only. Stored names that are not in the Champions roster stay labeled in place.")
                .font(Theme.body(.footnote))
                .foregroundStyle(Theme.textSecondary)
            }
          }

          ForEach($model.members) { $member in
            if let index = model.members.firstIndex(where: { $0.id == member.id }) {
              MemberEditorSection(
                index: index,
                member: $member,
                warnings: model.warnings(forSlot: index),
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
                onRemove: { model.removeMember(at: index) }
              )
              .id(member.id)
            }
          }

          if model.canAddMember && !model.isReadOnly {
            Section {
              Button {
                model.addMember()
              } label: {
                Label("Add Pokémon", systemImage: "plus.circle")
              }
            }
          }

          if !model.teamLevelWarnings.isEmpty {
            Section("Team legality") {
              ForEach(Array(model.teamLevelWarnings.enumerated()), id: \.offset) { _, warning in
                WarningRow(warning: warning)
                  .transition(warningTransition)
              }
            }
          }

          // Passive draft-coverage read (#9) — debounced off member edits below.
          TeamAnalysisSection(model: model)
        }
      }
      // Member edits flow through direct bindings, so the coverage analysis is (re)scheduled
      // from the view whenever the draft's members change; the view model debounces + coalesces.
      .onChange(of: model.members) { _, members in
        model.scheduleAnalysis()
        if selectedRosterIndex >= members.count {
          selectedRosterIndex = max(0, members.count - 1)
        }
      }
      .scrollDisabled(isReorderingRoster)
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.warnings)
      .navigationTitle(
        model.isReadOnly ? "Archived team" : (model.savedTeam == nil ? "New team" : "Edit team")
      )
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if !model.isReadOnly {
          ToolbarItem(placement: .topBarTrailing) {
            Button {
              openAssistant()
            } label: {
              Label("Team assistant", systemImage: "sparkles")
            }
            .foregroundStyle(Theme.onRed)
          }
          .oakLidItem()
          if #available(iOS 26.0, *) {
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
          }
          ToolbarItem(placement: .topBarTrailing) {
            if model.isSaving {
              ProgressView()
                .tint(Theme.onRed)
            } else if model.canSave {
              Button("Save") {
                Task { await saveAndConfirm() }
              }
              .font(Theme.body(.subheadline, weight: .semibold))
              .foregroundStyle(Theme.onRed)
              .padding(.horizontal, 12)
              .padding(.vertical, 6)
              .background(Theme.onRed.opacity(0.16), in: Capsule())
              .overlay(Capsule().strokeBorder(Theme.onRed.opacity(0.45), lineWidth: 1))
            }
          }
          .oakLidItem()
        }
        if model.teamId != nil {
          ToolbarItem(placement: .topBarLeading) {
            Button {
              Task {
                if let paste = await model.exportPaste() {
                  exportedPaste = ExportPayload(text: paste)
                }
              }
            } label: {
              Label("Export", systemImage: "square.and.arrow.up")
            }
          }
          .oakLidItem()
        }
      }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          ErrorBanner(message: message, onDismiss: { model.dismissError() })
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.sm)
        }
      }
      .overlay(alignment: .top) {
        if showSaveConfirmation {
          saveConfirmationBadge
            .padding(.top, 4)
            .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
        }
      }
      .sheet(item: $exportedPaste) { payload in
        ExportSheet(text: payload.text)
          .oakPaperSheet()
      }
      // `.sheet(item:)` on the presentation-only binding — a nil-model blank sheet is
      // then structurally impossible (the sheet only presents once the model exists) —
      // while the lifetime holder (`assistant`) is untouched by dismiss.
      .sheet(item: $presentedAssistant) { assistant in
        TeamsAssistantSheet(model: assistant)
          .oakPaperSheet()
      }
      .task {
        // `load()` (existing-team path) fetches sprites/movepools itself once the members
        // arrive from the server; a new/already-loaded team's members are seeded straight
        // away, so refresh those directly instead of duplicating the network round trip.
        if loadsOnAppear {
          await model.load()
        } else {
          await model.refreshSprites()
          await model.refreshAllMovepools()
        }
      }
    }
  }

  // MARK: Team assistant

  /// Opens the assistant sheet. Constructs the lifetime-held view model (bound to this
  /// editor's live draft and the injected service) only the first time — reopening after a
  /// dismiss reuses the same instance, preserving its in-memory thread. Presenting assigns
  /// that long-lived model to the presentation binding, which is what actually triggers
  /// `.sheet(item:)`; dismiss nils only the presentation binding.
  private func openAssistant() {
    if assistant == nil {
      assistant = TeamsAssistantViewModel(service: services.teamsAssistant, editor: model)
    }
    presentedAssistant = assistant
  }

  // MARK: Save confirmation

  /// Saves the team; on success, fires the success haptic and shows the transient
  /// "Saved" badge for ~1s before fading it back out.
  private func saveAndConfirm() async {
    guard await model.save() != nil else { return }
    Haptics.success()
    withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
      showSaveConfirmation = true
    }
    try? await Task.sleep(nanoseconds: 1_000_000_000)
    withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
      showSaveConfirmation = false
    }
  }

  private var saveConfirmationBadge: some View {
    Label("Saved", systemImage: "checkmark.circle.fill")
      .font(Theme.body(.subheadline, weight: .semibold))
      .foregroundStyle(Theme.success)
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
      .oakCard(radius: Theme.Radius.pill)
  }

  /// One-shot entrance for a newly-surfaced team-level legality warning.
  private var warningTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
  }

}

// MARK: - Export payload + sheet

/// A small `Identifiable` wrapper so the export paste can drive `.sheet(item:)`.
private struct ExportPayload: Identifiable {
  let id = UUID()
  let text: String
}

/// The export sheet: shows the Showdown paste, a native share affordance (`ShareLink`),
/// and a copy-to-clipboard button (M-AC-T2.3 — native share / clipboard).
private struct ExportSheet: View {
  let text: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        Text(text)
          .font(Theme.mono(.footnote))
          .frame(maxWidth: .infinity, alignment: .leading)
          .textSelection(.enabled)
          .padding()
      }
      .navigationTitle("Showdown export")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Copy") { UIPasteboard.general.string = text }
        }
        .oakLidItem()
        ToolbarItem(placement: .topBarTrailing) {
          ShareLink(item: text) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
        }
        .oakLidItem()
      }
      .safeAreaInset(edge: .bottom) {
        Button("Done") { dismiss() }
          .buttonStyle(.oakPrimary)
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.vertical, Theme.Spacing.sm)
          .frame(maxWidth: .infinity)
          .background(Theme.canvas)
      }
    }
    .oakEnamelNav()
  }
}

// MARK: - One member set

/// The editor for a single member slot. A self-contained subview so the parent `Form`
/// stays within the type-checker's reach and each set edits in isolation.
private struct MemberEditorSection: View {
  let index: Int
  @Binding var member: EditableMember
  let warnings: [TeamWarning]
  /// The resolved sprite/type/ability/base-stat ref for this slot's species, or `nil`
  /// while unresolved/unset — drives the identity header, the Ability picker's options,
  /// and the Mega item lock.
  let spriteRef: DexSpriteRef?
  /// This species' legal ability slugs as picker options (the Ability picker's ONLY
  /// offered choices) — empty until `spriteRef` resolves.
  let abilityOptions: [PickerOption]
  /// This species' legal movepool as picker options (the Move pickers' ONLY offered
  /// choices) — empty until the learnset fetch resolves.
  let movepoolOptions: [PickerOption]
  /// Backs the species/item pickers' network search (routed through the owning
  /// ``TeamEditorViewModel``, never touching ``DexLookupService`` directly).
  let search: (EntityKind, String) async -> [PickerOption]
  let isReadOnly: Bool
  let showsTeraField: Bool
  let showsIVKnobs: Bool
  let showsLevelKnob: Bool
  let showsStatPoints: Bool
  let statPointBudget: Int
  let statPointStatCap: Int
  /// Fired whenever `member.species` changes, so the owner can re-resolve sprites/
  /// movepool for the new (or cleared) species.
  let onSpeciesChange: () -> Void
  let onRemove: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// A Mega (or any form with a required item) locks its held item to that stone —
  /// mirrors `TeamMemberPanel.tsx`'s `itemLocked`.
  private var requiredItem: String? {
    let stone = spriteRef?.requiredItem
    return (stone?.isEmpty ?? true) ? nil : stone
  }

  var body: some View {
    Section {
      // The whole set renders as one `.oakCard()` unit rather than a stack of
      // plain Form rows, type-tinted once the species' primary type resolves.
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
        StatStepperGrid(
          title: showsStatPoints ? "Stat Points" : "EVs",
          spread: $member.evs,
          range: showsStatPoints ? 0...statPointStatCap : 0...252,
          step: showsStatPoints ? 1 : 4,
          footnote: evFootnote
        )
        .disabled(isReadOnly)
        if showsIVKnobs {
          StatStepperGrid(
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
              WarningRow(warning: warning)
                .transition(warningTransition)
            }
          }
          .animation(reduceMotion ? nil : Theme.Motion.smooth, value: warnings)
        }
      }
      .padding(16)
      // Type-reactive member plate when types known (soul.md Phase 2.2).
      // Accent is never used as a selection rail.
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

  /// One-shot entrance for a newly-surfaced per-slot legality warning.
  private var warningTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
  }

  private var headerTitle: String {
    let species = member.species.trimmingCharacters(in: .whitespacesAndNewlines)
    if species.isEmpty { return "Pokémon \(index + 1)" }
    return spriteRef?.displayName ?? TeamBlocksView.titleizeNonNil(species)
  }

  /// Sprite + type badges for the resolved species (mirrors `TeamMemberPanel.tsx`'s
  /// identity block) — omitted for an empty slot or before the batch sprite fetch resolves.
  /// Type-glow well when types are known (soul.md Phase 2.2 party edge language).
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
      .modifier(RosterTypeEdge(primary: primary, secondary: secondary))
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
      MoveFieldRow(
        title: "Move \(moveIndex + 1)",
        value: moveBinding(moveIndex),
        movepool: movepoolOptions,
        disabled: member.species.isEmpty,
        placeholder: member.species.isEmpty ? "Select a species first" : "Move \(moveIndex + 1)",
        search: search
      )
    }
  }

  /// An explicit per-slot move binding (a `Binding` to an array element is not a stable
  /// keyPath, so it's built by hand over the member binding).
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
    slugField("Nickname", text: $member.nickname, autocapitalize: true)
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

  /// EV / Stat Point budget footnote — informational, never blocking.
  private var evFootnote: String {
    let total = member.evs.total
    let budget = showsStatPoints ? statPointBudget : 508
    if total > budget {
      return "Total \(total) / \(budget) — over the legal budget (saved anyway)."
    }
    return "Total \(total) / \(budget)"
  }

  /// A slug/search text field with no autocapitalization/autocorrection (slugs are
  /// lowercase) unless it's a free-text field like the nickname.
  private func slugField(_ title: String, text: Binding<String>, autocapitalize: Bool = false) -> some View {
    LabeledContent(title) {
      TextField(title, text: text)
        .multilineTextAlignment(.trailing)
        .textInputAutocapitalization(autocapitalize ? .words : .never)
        .autocorrectionDisabled(!autocapitalize)
    }
  }
}

// MARK: - Move field (picker + persistent type/category/power readout)

/// One move field: an ``EntityPickerRow`` scoped to the species' fetched movepool, plus a
/// persistent metadata line for the currently selected move — mirrors the Type/Category/
/// Power columns `TeamMemberPanel.tsx`'s moves table renders alongside each picker. The
/// metadata line is absent when the current value isn't in `movepool` (unset, or an
/// off-learnset move riding a `move_not_in_learnset` warning) — that move simply isn't
/// offered as a picker choice, matching web's excluded-not-warned picker semantics.
private struct MoveFieldRow: View {
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

// MARK: - Roster strip (sprite overview + tap-to-scroll / long-press reorder)

/// A horizontal overview of the (up to six) member slots — sprite + name — sitting above
/// the per-member sections. Tapping a slot scrolls the focused
/// ``MemberEditorSection`` into view; this is iOS's native stand-in for web's
/// `RosterStrip.tsx` (which additionally *selects* a single focused panel — this editor
/// keeps every member's section expanded inline, better suited to a native `Form`, so
/// "select" here means "scroll to" rather than "show only this one").
///
/// Long-press then drag reorders the draft (insert, not swap). The member list
/// below is the same `members` array, so it refreshes on drop.
private struct RosterStripView: View {
  let members: [EditableMember]
  let spriteRefs: [String: DexSpriteRef]
  let selectedIndex: Int
  let canReorder: Bool
  @Binding var isReordering: Bool
  let onSelect: (Int) -> Void
  let onMove: (Int, Int) -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var draggingIndex: Int?
  @State private var hoverIndex: Int?
  @State private var dragTranslation: CGSize = .zero
  @State private var slotFrames: [Int: CGRect] = [:]

  private let rosterSpace = "roster-strip"

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
          slotCell(member: member, index: index)
        }
      }
      .padding(.horizontal, 4)
      .padding(.vertical, 2)
      .coordinateSpace(.named(rosterSpace))
      .onPreferenceChange(RosterSlotFrameKey.self) { newFrames in
        // Freeze frames while dragging so offset-driven layout does not cycle.
        if draggingIndex == nil { slotFrames = newFrames }
      }
    }
    .scrollDisabled(draggingIndex != nil)
    .accessibilityLabel("Team roster")
    .onChange(of: draggingIndex) { _, value in
      isReordering = value != nil
    }
  }

  @ViewBuilder
  private func slotCell(member: EditableMember, index: Int) -> some View {
    let slot = rosterSlot(member: member, index: index)
      .offset(x: xOffset(for: index), y: index == draggingIndex ? dragTranslation.height : 0)
      .zIndex(index == draggingIndex ? 1 : 0)
      .scaleEffect(liftScale(for: index))
      .modifier(RosterDragLift(enabled: index == draggingIndex && !reduceMotion))
      .background {
        GeometryReader { geo in
          Color.clear.preference(
            key: RosterSlotFrameKey.self,
            value: [index: geo.frame(in: .named(rosterSpace))]
          )
        }
      }
      .contentShape(Rectangle())
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(slotLabel(member, index))
      .accessibilityAddTraits(.isButton)
      .accessibilityHint(canReorder ? "Hold, then drag to reorder." : "")
      .accessibilityActions {
        if canReorder, index > 0 {
          Button("Move left") { onMove(index, index - 1) }
        }
        if canReorder, index < members.count - 1 {
          Button("Move right") { onMove(index, index + 1) }
        }
      }

    let tap = TapGesture().onEnded { onSelect(index) }
    if canReorder {
      slot.gesture(reorderGesture(for: index).exclusively(before: tap))
    } else {
      slot.gesture(tap)
    }
  }

  /// One party slot. Selected slot gets a 2px poke-red ring (Enamel & Paper
  /// roster-slot recipe). Empty slots sit in a quiet paper well.
  private func rosterSlot(member: EditableMember, index: Int) -> some View {
    let ref = member.species.isEmpty ? nil : spriteRefs[member.species]
    let selected = index == selectedIndex
    return VStack(spacing: 4) {
      SpriteImage(
        urlString: ref?.spriteUrl,
        name: slotLabel(member, index),
        size: 44
      )
      .padding(6)
      .background(
        Theme.surfaceSunken,
        in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(
            hoverIndex == index && draggingIndex != nil && draggingIndex != index
              ? Theme.accent
              : (selected ? Theme.accent : Theme.border),
            lineWidth: selected || (hoverIndex == index && draggingIndex != nil) ? 2 : 1
          )
      }
      Text(slotLabel(member, index))
        .font(Theme.body(.caption2))
        .foregroundStyle(selected ? Theme.accent : Theme.textPrimary)
        .lineLimit(1)
        .frame(width: 60)
    }
  }

  private func slotLabel(_ member: EditableMember, _ index: Int) -> String {
    member.species.isEmpty
      ? "Slot \(index + 1)"
      : (spriteRefs[member.species]?.displayName ?? TeamBlocksView.titleizeNonNil(member.species))
  }

  /// Long-press sequenced into a drag. Combined with a tap via `exclusively(before:)`
  /// so a short press still fires on lift (no 350ms tap delay).
  private func reorderGesture(for index: Int) -> some Gesture {
    LongPressGesture(minimumDuration: 0.35)
      .sequenced(
        before: DragGesture(minimumDistance: 0, coordinateSpace: .named(rosterSpace))
      )
      .onChanged { value in
        guard case .second(true, let drag) = value, let drag else { return }
        if draggingIndex == nil {
          draggingIndex = index
          hoverIndex = index
          Haptics.tap()
        }
        dragTranslation = drag.translation
        let nextHover = indexAt(drag.location)
        if nextHover != hoverIndex {
          hoverIndex = nextHover
          if nextHover != draggingIndex {
            Haptics.tap()
          }
        }
      }
      .onEnded { _ in
        if let from = draggingIndex, let to = hoverIndex, from != to {
          onMove(from, to)
        }
        draggingIndex = nil
        hoverIndex = nil
        dragTranslation = .zero
      }
  }

  private func indexAt(_ point: CGPoint) -> Int {
    let sorted = slotFrames.sorted { $0.key < $1.key }
    guard !sorted.isEmpty else { return 0 }
    if let hit = sorted.first(where: { $0.value.minX <= point.x && point.x < $0.value.maxX }) {
      return hit.key
    }
    if let first = sorted.first, point.x < first.value.minX { return first.key }
    return sorted.last?.key ?? 0
  }

  private func xOffset(for index: Int) -> CGFloat {
    if index == draggingIndex { return dragTranslation.width }
    guard let from = draggingIndex, let hover = hoverIndex, from != hover else { return 0 }
    let width = slotFrames[from]?.width ?? 60
    let stride = width + 10
    if from < hover, index > from, index <= hover { return -stride }
    if hover < from, index >= hover, index < from { return stride }
    return 0
  }

  private func liftScale(for index: Int) -> CGFloat {
    guard index == draggingIndex, !reduceMotion else { return 1 }
    return 1.08
  }
}

/// Slot frames in the roster strip's named coordinate space, used to map a
/// drag location onto a destination index.
private struct RosterSlotFrameKey: PreferenceKey {
  static var defaultValue: [Int: CGRect] { [:] }
  static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
    value.merge(nextValue(), uniquingKeysWith: { $1 })
  }
}

/// Raised umber shadow only while a roster slot is lifted for reorder.
private struct RosterDragLift: ViewModifier {
  let enabled: Bool

  func body(content: Content) -> some View {
    if enabled {
      content.oakShadow(Theme.Shadow.raised)
    } else {
      content
    }
  }
}

/// Type edge / glow for a roster slot when types are known; empty/unknown slots
/// keep a quiet sunken well (soul.md Phase 2.2).
private struct RosterTypeEdge: ViewModifier {
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

// MARK: - Stat stepper grid

/// Six labeled steppers for an EV or IV spread, with an optional budget footnote. Reused
/// for both spreads; the only difference is the range/step.
private struct StatStepperGrid: View {
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

// MARK: - Warning row (warn-but-allow advisory)

/// One advisory warning: a severity icon **and** the message text — the icon shape +
/// wording carry the meaning, so any tint is reinforcement only (M-AC-UI9.3).
private struct WarningRow: View {
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
    // A soft legality callout with a severity rail (§5.6) — never color alone; the
    // icon + accessibility label state severity too.
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
