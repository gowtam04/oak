import CoreGraphics
import SwiftUI

/// Settings list rows (P-SET-AC-1.1). Guest vs signed-in from ``AccountViewModel``.
enum PadSettingsRow: String, CaseIterable, Identifiable, Equatable, Sendable {
  case account
  case appearance
  case answerCards
  case calculator
  case sharedByMe
  case deleteAccount
  case about

  var id: String { rawValue }

  var title: String {
    switch self {
    case .account: "Account"
    case .appearance: "Appearance"
    case .answerCards: "Answer cards"
    case .calculator: "Calculator"
    case .sharedByMe: "Shared by me"
    case .deleteAccount: "Delete account"
    case .about: "About"
    }
  }

  var systemImage: String {
    switch self {
    case .account: "person.crop.circle"
    case .appearance: "circle.lefthalf.filled"
    case .answerCards: "rectangle.on.rectangle"
    case .calculator: "function"
    case .sharedByMe: "link"
    case .deleteAccount: "trash"
    case .about: "info.circle"
    }
  }
}

/// Pure Settings-split policy (P-SET-US-1, P-SET-AC-1.1).
enum PadSettingsChrome {
  /// Leading Settings list | trailing detail page (P-SET-US-1, P-SET-AC-1.1).
  static func showsListAndDetail() -> Bool { true }

  /// Wide landscape keeps the list; portrait/compact collapse it.
  static func showsListColumn(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    mode == .regular && !isPortrait
  }

  /// Portrait/compact: detail is primary once a row is selected.
  static func detailIsPrimary(
    hasSelection: Bool,
    mode: PadLayoutMode,
    isPortrait: Bool
  ) -> Bool {
    hasSelection && !showsListColumn(mode: mode, isPortrait: isPortrait)
  }

  static func rows(isSignedIn: Bool) -> [PadSettingsRow] {
    var rows: [PadSettingsRow] = [.account, .appearance, .answerCards, .calculator]
    if isSignedIn {
      rows.append(contentsOf: [.sharedByMe, .deleteAccount])
    }
    rows.append(.about)
    return rows
  }

  /// PadRootView overlay controls are 44pt + `Theme.Spacing.sm`.
  static let overlayControlInset: CGFloat = 56
}

/// iPad Settings destination: list | detail (P-SET-US-1).
/// Same ``AccountViewModel`` as iPhone; Auth/OTP and deletion are centered panels.
struct PadSettingsSplit: View {
  var shell: PadShellModel
  var layoutMode: PadLayoutMode
  var onSignIn: () -> Void

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(UpdateViewModel.self) private var updateModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var model: AccountViewModel?
  @State private var selected: PadSettingsRow?
  @State private var isPortrait = false
  @State private var showingDeleteConfirm = false
  @State private var showingUpdateStatus = false

  private var isSignedIn: Bool {
    model?.isSignedIn ?? false
  }

  var body: some View {
    let _ = shell.destination
    applyLifecycle(to: root)
  }

  @ViewBuilder
  private var root: some View {
    GeometryReader { geo in
      let portrait = geo.size.height > geo.size.width
      let showList = PadSettingsChrome.showsListColumn(
        mode: layoutMode, isPortrait: portrait)
      let detailPrimary = PadSettingsChrome.detailIsPrimary(
        hasSelection: selected != nil,
        mode: layoutMode,
        isPortrait: portrait
      )
      Group {
        if showList {
          HStack(spacing: 0) {
            listColumn
              .frame(width: PadLayout.chatListMinWidth)
              .frame(maxHeight: .infinity)
            columnSeparator
            detailPane(showsBack: false)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        } else if detailPrimary {
          detailPane(showsBack: true)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          listColumn
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .onAppear {
        isPortrait = portrait
        defaultSelectionIfNeeded()
      }
      .onChange(of: geo.size) { _, size in
        isPortrait = size.height > size.width
        defaultSelectionIfNeeded()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .overlay {
      if showingDeleteConfirm {
        PadCenteredPanel(onDismiss: dismissDeleteConfirm) {
          deleteConfirmPanel
        }
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: selected)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-settings-split")
  }

  private func applyLifecycle<Content: View>(to view: Content) -> some View {
    view
      .onAppear { ensureModel() }
      .task { ensureModel() }
      .onChange(of: isSignedIn) { _, signedIn in
        pruneSelection(isSignedIn: signedIn)
      }
      .onChange(of: layoutMode) { _, _ in
        defaultSelectionIfNeeded()
      }
      .onChange(of: isPortrait) { _, _ in
        defaultSelectionIfNeeded()
      }
      .onChange(of: shell.centeredPanelPresented) { _, presented in
        if !presented {
          showingDeleteConfirm = false
        }
      }
      .onChange(of: updateModel.manualMessage) { _, message in
        showingUpdateStatus = message != nil
      }
      .alert(
        "Updates",
        isPresented: $showingUpdateStatus,
        actions: {
          Button("OK", role: .cancel) {
            updateModel.dismissManualMessage()
          }
        },
        message: {
          Text(updateModel.manualMessage ?? "")
        }
      )
  }

  // MARK: List

  private var rows: [PadSettingsRow] {
    PadSettingsChrome.rows(isSignedIn: isSignedIn)
  }

  private var listColumn: some View {
    VStack(spacing: 0) {
      HStack(spacing: Theme.Spacing.sm) {
        Text("Settings")
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textStrong)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
      }
      .padding(.leading, listHeaderLeadingInset)
      .padding(.trailing, Theme.Spacing.sm)
      .padding(.top, Theme.Spacing.md)
      .padding(.bottom, Theme.Spacing.xs)

      List {
        ForEach(rows) { row in
          listRow(row)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
    }
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-settings-list")
  }

  private var listHeaderLeadingInset: CGFloat {
    layoutMode == .compact ? PadSettingsChrome.overlayControlInset : Theme.Spacing.lg
  }

  @ViewBuilder
  private func listRow(_ row: PadSettingsRow) -> some View {
    switch row {
    case .calculator:
      Button {
        shell.openCalc(scenario: nil)
      } label: {
        rowLabel(row)
      }
      .buttonStyle(.plain)
      .listRowBackground(Theme.surface)
    case .deleteAccount:
      Button {
        selected = row
      } label: {
        rowLabel(row, tint: Theme.danger)
      }
      .buttonStyle(.plain)
      .listRowBackground(isSelected(row) ? Theme.dangerSoft : Theme.surface)
      .accessibilityAddTraits(isSelected(row) ? .isSelected : [])
    default:
      Button {
        selected = row
      } label: {
        rowLabel(row)
      }
      .buttonStyle(.plain)
      .listRowBackground(isSelected(row) ? Theme.accentSoft : Theme.surface)
      .accessibilityAddTraits(isSelected(row) ? .isSelected : [])
    }
  }

  private func rowLabel(_ row: PadSettingsRow, tint: Color = Theme.textPrimary) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      Label {
        Text(row.title)
          .foregroundStyle(tint)
      } icon: {
        Image(systemName: row.systemImage)
          .foregroundStyle(tint == Theme.textPrimary ? Theme.accent : tint)
      }
      .font(Theme.body(.body))
      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())
  }

  private func isSelected(_ row: PadSettingsRow) -> Bool {
    selected == row
  }

  // MARK: Detail

  private func detailPane(showsBack: Bool) -> some View {
    VStack(spacing: 0) {
      detailHeader(showsBack: showsBack)
      if let selected {
        detailBody(selected)
      } else {
        ContentUnavailableView {
          Label("Settings", systemImage: "gearshape")
        } description: {
          Text("Select a page.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-settings-detail")
  }

  private func detailHeader(showsBack: Bool) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      if showsBack {
        Button {
          selected = nil
        } label: {
          Image(systemName: "chevron.left")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Settings")
      }
      Text(selected?.title ?? "Settings")
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, headerTrailingInset)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }

  private var headerLeadingInset: CGFloat {
    layoutMode == .compact ? PadSettingsChrome.overlayControlInset : Theme.Spacing.md
  }

  private var headerTrailingInset: CGFloat {
    Theme.Spacing.md
  }

  @ViewBuilder
  private func detailBody(_ row: PadSettingsRow) -> some View {
    switch row {
    case .account:
      accountPage
    case .appearance:
      appearancePage
    case .answerCards:
      answerCardsPage
    case .about:
      aboutPage
    case .sharedByMe:
      NavigationStack {
        SharedByMeView(shares: services.shares)
          .toolbar(.hidden, for: .navigationBar)
      }
    case .deleteAccount:
      deleteAccountPage
    case .calculator:
      ContentUnavailableView {
        Label("Settings", systemImage: "gearshape")
      } description: {
        Text("Select a page.")
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Theme.canvas)
    }
  }

  // MARK: Pages (same rows as iPhone AccountView)

  @ViewBuilder
  private var accountPage: some View {
    if let model {
      Form {
        Section {
          profileHeader(model)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
        Section {
          if model.isSignedIn {
            Button {
              Task { await model.signOut() }
            } label: {
              actionLabel(title: "Sign out", systemImage: "rectangle.portrait.and.arrow.right")
            }
            .disabled(model.isBusy)
            .accessibilityHint(
              "Returns the app to guest mode and removes your session from this device.")
          } else {
            Button {
              onSignIn()
            } label: {
              actionLabel(
                title: "Sign in",
                systemImage: "person.crop.circle.badge.plus",
                tint: Theme.accent
              )
            }
            .accessibilityHint(
              "Sign in with your email to unlock saved history and the team builder.")
          }
        } header: {
          Text("Account").instrumentLabel().foregroundStyle(Theme.textSecondary)
        } footer: {
          Text(model.tierDescription)
        }
        if let message = model.errorMessage {
          errorSection(message, model: model)
        }
      }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func profileHeader(_ model: AccountViewModel) -> some View {
    HStack(spacing: 16) {
      ZStack {
        Circle().fill(Theme.accent.opacity(0.20))
        if let initial = emailInitial(model) {
          Text(initial)
            .font(Theme.display(.title2))
            .foregroundStyle(Theme.accent)
        } else {
          Image(systemName: "person.fill")
            .font(.title2)
            .foregroundStyle(Theme.accent)
        }
      }
      .frame(width: 56, height: 56)
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(model.tierTitle)
          .font(Theme.display(.title2))
        Text(model.email ?? "Sign in to save your history and teams")
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
      }
      Spacer(minLength: 0)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard()
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.isSignedIn)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      model.email.map { "\(model.tierTitle), \($0)" } ?? model.tierTitle
    )
  }

  private func emailInitial(_ model: AccountViewModel) -> String? {
    guard let first = model.email?.trimmingCharacters(in: .whitespaces).first else { return nil }
    return String(first).uppercased()
  }

  private var appearancePage: some View {
    Form {
      Section {
        ForEach(AppearancePreference.allCases, id: \.self) { pref in
          Button {
            Haptics.tap()
            appState.appearance = pref
          } label: {
            HStack {
              actionLabel(title: pref.title, systemImage: pref.symbol)
              Spacer()
              if appState.appearance == pref {
                Image(systemName: "checkmark")
                  .foregroundStyle(Theme.accent)
                  .accessibilityHidden(true)
              }
            }
          }
          .accessibilityAddTraits(appState.appearance == pref ? .isSelected : [])
          .accessibilityHint("Sets the app appearance to \(pref.title).")
        }
      } header: {
        Text("Appearance").instrumentLabel().foregroundStyle(Theme.textSecondary)
      } footer: {
        Text("System follows your iPad's Light/Dark setting.")
      }
    }
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .listRowBackground(Theme.surface)
  }

  @ViewBuilder
  private var answerCardsPage: some View {
    if let model {
      Form {
        Section {
          Picker(
            "Answer cards",
            selection: Binding(
              get: { model.answerDensity },
              set: { next in Task { await model.setAnswerDensity(next) } }
            )
          ) {
            Text("Full").tag(AnswerDensity.full)
            Text("Compact").tag(AnswerDensity.compact)
          }
        } footer: {
          Text("Compact hides Why / Sources on answer cards. Facts and caveats stay visible.")
        }
      }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var aboutPage: some View {
    Form {
      Section {
        Link(destination: AccountView.privacyPolicyURL) {
          actionLabel(title: "Privacy Policy", systemImage: "hand.raised")
        }
        Link(destination: AccountView.supportURL) {
          actionLabel(title: "Support", systemImage: "questionmark.circle")
        }
        Button {
          Task { await updateModel.checkManually() }
        } label: {
          HStack {
            actionLabel(title: "Check for updates", systemImage: "arrow.down.app")
            if updateModel.isChecking {
              Spacer()
              ProgressView()
            }
          }
        }
        .disabled(updateModel.isChecking)
        .accessibilityHint("Checks the App Store for a newer version of Oak.")
        LabeledContent {
          Text(AccountView.versionString)
            .font(Theme.mono(.subheadline))
            .foregroundStyle(Theme.textSecondary)
        } label: {
          Label("Version", systemImage: "info.circle")
        }
      } header: {
        Text("About").instrumentLabel().foregroundStyle(Theme.textSecondary)
      }
    }
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .listRowBackground(Theme.surface)
  }

  @ViewBuilder
  private func errorSection(_ message: String, model: AccountViewModel) -> some View {
    Section {
      HStack(alignment: .top, spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(Theme.danger)
          .accessibilityHidden(true)
        Text(message)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
        Button("Dismiss") { model.dismissError() }
          .font(Theme.body(.footnote))
          .buttonStyle(.borderless)
      }
      .accessibilityElement(children: .combine)
    }
  }

  @ViewBuilder
  private var deleteAccountPage: some View {
    if let model {
      Form {
        Section {
          Button(role: .destructive) {
            Haptics.warning()
            presentDeleteConfirm()
          } label: {
            HStack {
              actionLabel(title: "Delete account", systemImage: "trash", tint: Theme.danger)
              if model.isBusy {
                Spacer()
                ProgressView()
              }
            }
          }
          .disabled(model.isBusy)
          .listRowBackground(Theme.dangerSoft)
          .accessibilityHint(
            "Permanently deletes your account, history, and teams. This can't be undone.")
        } header: {
          Text("Danger zone").instrumentLabel().foregroundStyle(Theme.textSecondary)
        } footer: {
          Text("Permanently removes your account and all of its data from Oak.")
        }
        if let message = model.errorMessage {
          errorSection(message, model: model)
        }
      }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var deleteConfirmPanel: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
      Text("Delete account?")
        .font(Theme.display(.title2))
        .foregroundStyle(Theme.textPrimary)
      Text(AccountViewModel.deletionWarning)
        .font(Theme.body(.body))
        .foregroundStyle(Theme.textSecondary)
      if let model, model.isBusy {
        ProgressView()
          .frame(maxWidth: .infinity)
      }
      Button("Delete account", role: .destructive) {
        Task {
          await model?.deleteAccount()
          if model?.isSignedIn == false {
            dismissDeleteConfirm()
          }
        }
      }
      .buttonStyle(.oakSecondary)
      .disabled(model?.isBusy == true)
      .accessibilityHint("Permanently deletes your account, history, and teams. This can't be undone.")
      Button("Cancel", role: .cancel) {
        dismissDeleteConfirm()
      }
      .buttonStyle(.oakSecondary)
    }
    .padding(Theme.Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.canvas)
  }

  private func actionLabel(
    title: String,
    systemImage: String,
    tint: Color = Theme.textPrimary
  ) -> some View {
    Label {
      Text(title)
        .foregroundStyle(tint)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(tint == Theme.textPrimary ? Theme.accent : tint)
    }
    .font(Theme.body(.body))
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  // MARK: Selection / panels

  private func ensureModel() {
    guard model == nil else { return }
    model = AccountViewModel(auth: services.auth, appState: appState)
  }

  private func defaultSelectionIfNeeded() {
    let showList = PadSettingsChrome.showsListColumn(
      mode: layoutMode, isPortrait: isPortrait)
    if showList, selected == nil {
      selected = .account
    }
  }

  private func pruneSelection(isSignedIn: Bool) {
    switch selected {
    case .sharedByMe, .deleteAccount:
      if !isSignedIn { selected = .account }
    default:
      break
    }
  }

  private func presentDeleteConfirm() {
    showingDeleteConfirm = true
    shell.centeredPanelPresented = true
  }

  private func dismissDeleteConfirm() {
    showingDeleteConfirm = false
    shell.dismissCenteredPanels()
  }
}
