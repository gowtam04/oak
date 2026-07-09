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
/// batch-resolved sprites (`/api/sprites`) and scrolls to a tapped slot; a Mega's stone is
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
                onSelect: { index in
                  withAnimation(reduceMotion ? nil : Theme.Motion.smooth) {
                    proxy.scrollTo(model.members[index].id, anchor: .top)
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
            LabeledContent("Format", value: model.format.displayLabel)
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

          if model.canAddMember {
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
      .onChange(of: model.members) { _, _ in model.scheduleAnalysis() }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.warnings)
      .navigationTitle(model.savedTeam == nil ? "New team" : "Edit team")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            openAssistant()
          } label: {
            Label("Team assistant", systemImage: "sparkles")
          }
        }
        // On iOS 26 liquid glass the two trailing items merge into one capsule,
        // crowding the sparkle's tap target (TestFlight ANnTYLc). A fixed spacer
        // splits them into separate capsules; availability-gated because the deploy
        // target is iOS 18 (ToolbarContentBuilder supports `if #available`).
        if #available(iOS 26.0, *) {
          ToolbarSpacer(.fixed, placement: .topBarTrailing)
        }
        ToolbarItem(placement: .topBarTrailing) {
          if model.isSaving {
            ProgressView()
          } else {
            Button("Save") {
              Task { await saveAndConfirm() }
            }
            .fontWeight(.semibold)
          }
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
      }
      // `.sheet(item:)` on the presentation-only binding — a nil-model blank sheet is
      // then structurally impossible (the sheet only presents once the model exists) —
      // while the lifetime holder (`assistant`) is untouched by dismiss.
      .sheet(item: $presentedAssistant) { assistant in
        TeamsAssistantSheet(model: assistant)
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
        ToolbarItem(placement: .topBarTrailing) {
          ShareLink(item: text) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
        }
        ToolbarItem(placement: .bottomBar) {
          Button("Done") { dismiss() }
        }
      }
    }
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
        teraPicker
        Stepper(value: $member.level, in: 1...100) {
          LabeledContent("Level", value: "\(member.level)")
        }
        StatStepperGrid(
          title: "EVs",
          spread: $member.evs,
          range: 0...252,
          step: 4,
          footnote: evFootnote
        )
        StatStepperGrid(
          title: "IVs",
          spread: $member.ivs,
          range: 0...31,
          step: 1
        )
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
      .oakCard(radius: Theme.Radius.md, tint: spriteRef?.types.first.map(Theme.type))
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
    } header: {
      HStack {
        Text(headerTitle)
        Spacer()
        Button(role: .destructive, action: onRemove) {
          Label("Remove", systemImage: "trash")
            .labelStyle(.iconOnly)
        }
        .accessibilityLabel("Remove Pokémon \(index + 1)")
      }
    }
    .onChange(of: member.species) { _, _ in onSpeciesChange() }
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
  @ViewBuilder
  private var identityHeader: some View {
    if !member.species.isEmpty {
      HStack(spacing: 12) {
        SpriteImage(urlString: spriteRef?.spriteUrl, name: headerTitle, size: 48)
        VStack(alignment: .leading, spacing: 4) {
          Text(headerTitle)
            .font(Theme.body(.headline))
          if let types = spriteRef?.types, !types.isEmpty {
            HStack(spacing: 6) {
              ForEach(types, id: \.self) { TypeBadge(type: $0) }
            }
          }
        }
        Spacer(minLength: 0)
      }
    }
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
    EntityPickerRow(
      title: "Ability",
      value: member.ability,
      source: .options(abilityOptions),
      placeholder: member.species.isEmpty ? "Select a species first" : "Search abilities…",
      disabled: member.species.isEmpty,
      search: search,
      onChange: { member.ability = $0 }
    )
    EntityPickerRow(
      title: requiredItem != nil ? "Item (Mega stone)" : "Item",
      value: member.item,
      source: .search(.item),
      placeholder: "Search items…",
      disabled: requiredItem != nil,
      search: search,
      onChange: { member.item = $0 }
    )
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

  /// EV-budget footnote — informational, never blocking. Over 508 is the same advisory
  /// the server flags (M-AC-T3.1).
  private var evFootnote: String {
    let total = member.evs.total
    if total > 508 {
      return "Total \(total) / 508 — over the legal budget (saved anyway)."
    }
    return "Total \(total) / 508"
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

// MARK: - Roster strip (sprite overview + tap-to-scroll)

/// A horizontal overview of the (up to six) member slots — sprite + name — sitting above
/// the per-member sections. Tapping a slot scrolls the focused
/// ``MemberEditorSection`` into view; this is iOS's native stand-in for web's
/// `RosterStrip.tsx` (which additionally *selects* a single focused panel — this editor
/// keeps every member's section expanded inline, better suited to a native `Form`, so
/// "select" here means "scroll to" rather than "show only this one").
private struct RosterStripView: View {
  let members: [EditableMember]
  let spriteRefs: [String: DexSpriteRef]
  let onSelect: (Int) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
          Button {
            onSelect(index)
          } label: {
            VStack(spacing: 4) {
              SpriteImage(
                urlString: member.species.isEmpty ? nil : spriteRefs[member.species]?.spriteUrl,
                name: slotLabel(member, index),
                size: 44
              )
              Text(slotLabel(member, index))
                .font(Theme.body(.caption2))
                .lineLimit(1)
                .frame(width: 60)
            }
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 4)
      .padding(.vertical, 2)
    }
    .accessibilityLabel("Team roster")
  }

  private func slotLabel(_ member: EditableMember, _ index: Int) -> String {
    member.species.isEmpty
      ? "Slot \(index + 1)"
      : (spriteRefs[member.species]?.displayName ?? TeamBlocksView.titleizeNonNil(member.species))
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
