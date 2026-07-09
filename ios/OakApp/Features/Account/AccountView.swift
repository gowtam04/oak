import SwiftUI

/// The Account / Settings screen (M-UI-US-7): sign in/out, the current tier &
/// what it unlocks, the **account-deletion** flow (M-ACCT-US-6 / M-NFR-6), and
/// standard about/legal links. The former "Champions mode by default" preference
/// was removed — scope is chosen per conversation via the header scope chip
/// (`ChatView`), matching web (which also dropped its default toggle).
///
/// Pushed from the More tab's list (nav restructure: Chat / Teams / More), so this
/// view no longer owns a `NavigationStack` — it supplies the `Form` and title, and
/// ``MoreView`` supplies the stack.
///
/// The view owns its ``AccountViewModel`` (`@State`) and drives it from `Task`s;
/// all logic and copy live in the view model. Layout uses Dynamic-Type styles and
/// system semantic colors so it adapts to light/dark and text size (M-AC-UI1.3/4);
/// destructive and status rows pair an icon + text with color so meaning is never
/// carried by color alone (M-AC-UI9.3). Interactive controls carry VoiceOver
/// labels/hints (M-AC-UI9.1).
///
/// Chrome (UI-polish P6): a **profile header card** sits above the Form — a gradient
/// wash with a 56pt avatar (email initial or `person.fill`), the tier title in the
/// display face, and the email/sub-line beneath. The old `tierRow` folds into it.
/// The header crossfades between the guest and signed-in faces (a crossfade is the
/// Reduce-Motion-safe treatment; it's still gated so nothing animates when Reduce
/// Motion is on). The color/gradient is decorative — the tier is always spelled out
/// in text (M-AC-UI9.3).
struct AccountView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var model: AccountViewModel

  /// Drives the sign-in sheet (presented over the guest state).
  @State private var showingSignIn = false
  /// Drives the destructive account-deletion confirmation.
  @State private var showingDeleteConfirm = false

  init(model: AccountViewModel) {
    _model = State(initialValue: model)
  }

  var body: some View {
    Form {
      profileHeaderSection
      accountSection
      if let message = model.errorMessage {
        errorSection(message)
      }
      if model.isSignedIn {
        dangerSection
      }
      aboutSection
    }
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .listRowBackground(Theme.surface)
    .navigationTitle("Account")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $showingSignIn) {
      AuthView(model: model.makeAuthViewModel())
    }
    // Dismiss the sign-in sheet automatically once verification flips the app to
    // signed-in (the AuthView itself is presenter-agnostic).
    .onChange(of: model.isSignedIn) { _, signedIn in
      if signedIn { showingSignIn = false }
    }
    .alert("Delete account?", isPresented: $showingDeleteConfirm) {
      Button("Delete account", role: .destructive) {
        Task { await model.deleteAccount() }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text(AccountViewModel.deletionWarning)
    }
  }

  // MARK: Profile header card

  /// The gradient profile card. Lives in its own Section with cleared insets and a
  /// clear row background so it reads as a floating card rather than a Form row.
  @ViewBuilder
  private var profileHeaderSection: some View {
    Section {
      profileHeader
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
  }

  private var profileHeader: some View {
    HStack(spacing: 16) {
      avatar
      VStack(alignment: .leading, spacing: 4) {
        Text(model.tierTitle)
          .font(Theme.display(.title2))
        Text(headerSubtitle)
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
          .contentTransition(.opacity)
      }
      Spacer(minLength: 0)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
        .fill(
          LinearGradient(
            colors: [Theme.accent.opacity(0.14), Theme.azure.opacity(0.10)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
    }
    // Guest ↔ signed-in crossfade. A crossfade is inherently Reduce-Motion-safe, but
    // gate it anyway so nothing animates when the user has asked for stillness.
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.isSignedIn)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityTierLabel)
  }

  /// The 56pt avatar: the email's initial on an accent wash when signed in, a
  /// `person.fill` glyph when a guest. Crossfades with the rest of the header.
  private var avatar: some View {
    ZStack {
      Circle().fill(Theme.accent.opacity(0.20))
      if let initial = emailInitial {
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
  }

  /// The first letter of the signed-in email, uppercased; `nil` for a guest.
  private var emailInitial: String? {
    guard let first = model.email?.trimmingCharacters(in: .whitespaces).first else { return nil }
    return String(first).uppercased()
  }

  /// The header's second line: the email when signed in, an invitation when a guest.
  private var headerSubtitle: String {
    model.email ?? "Sign in to save your history and teams"
  }

  private var accessibilityTierLabel: String {
    if let email = model.email {
      return "\(model.tierTitle), \(email)"
    }
    return model.tierTitle
  }

  // MARK: Account actions

  /// The sign-in / sign-out control. The tier row it used to sit beside now lives in
  /// the profile header above; this section keeps the primary account action.
  @ViewBuilder
  private var accountSection: some View {
    Section {
      if model.isSignedIn {
        Button {
          Task { await model.signOut() }
        } label: {
          actionLabel(title: "Sign out", systemImage: "rectangle.portrait.and.arrow.right")
        }
        .disabled(model.isBusy)
        .accessibilityHint("Returns the app to guest mode and removes your session from this device.")
      } else {
        Button {
          showingSignIn = true
        } label: {
          actionLabel(title: "Sign in", systemImage: "person.crop.circle.badge.plus")
        }
        .accessibilityHint("Sign in with your email to unlock saved history and the team builder.")
      }
    } footer: {
      Text(model.tierDescription)
    }
  }

  // MARK: Danger zone (account deletion)

  @ViewBuilder
  private var dangerSection: some View {
    Section {
      Button(role: .destructive) {
        // A cautionary tap as the destructive confirmation opens (redundant with the
        // visible alert — never the sole signal, M-AC-UI9.3).
        Haptics.warning()
        showingDeleteConfirm = true
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
      .accessibilityHint("Permanently deletes your account, history, and teams. This can't be undone.")
    } header: {
      Text("Danger zone").instrumentLabel().foregroundStyle(Theme.textSecondary)
    } footer: {
      Text("Permanently removes your account and all of its data from Oak.")
    }
  }

  // MARK: About / legal

  @ViewBuilder
  private var aboutSection: some View {
    Section {
      Link(destination: Self.privacyPolicyURL) {
        actionLabel(title: "Privacy Policy", systemImage: "hand.raised")
      }
      Link(destination: Self.supportURL) {
        actionLabel(title: "Support", systemImage: "questionmark.circle")
      }
      LabeledContent {
        Text(Self.versionString)
          .font(Theme.mono(.subheadline))
          .foregroundStyle(Theme.textSecondary)
      } label: {
        Label("Version", systemImage: "info.circle")
      }
    } header: {
      Text("About").instrumentLabel().foregroundStyle(Theme.textSecondary)
    }
  }

  // MARK: Error banner row

  @ViewBuilder
  private func errorSection(_ message: String) -> some View {
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

  // MARK: Helpers

  /// A label that scales with Dynamic Type (no fixed sizing) and reads as one
  /// element to VoiceOver. Icon tints `Theme.accent` for normal rows; both text
  /// and icon take the `tint` color for destructive/override rows.
  private func actionLabel(title: String, systemImage: String, tint: Color = Theme.textPrimary) -> some View {
    Label {
      Text(title)
        .foregroundStyle(tint)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(tint == Theme.textPrimary ? Theme.accent : tint)
    }
    .font(Theme.body(.body))
  }

  // MARK: Legal/support links + version
  //
  // NOTE: the privacy policy must be live at this URL before App Store
  // submission (M-NFR-7). Support points to gowtam.ai's contact section.
  // These wire the about/legal surface (M-UI-US-7).
  static let privacyPolicyURL = URL(string: "https://oak.gowtam.ai/privacy")!
  static let supportURL = URL(string: "https://www.gowtam.ai/#contact")!

  /// The marketing version + build, read from the bundle (set in `project.yml`).
  static var versionString: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
    let build = info?["CFBundleVersion"] as? String ?? "1"
    return "\(version) (\(build))"
  }
}

#if DEBUG
/// A preview-only ``AuthService`` so the canvas renders without the network.
private struct PreviewAccountAuthService: AuthService {
  func requestCode(email: String) async throws {}
  func verify(email: String, code: String) async throws -> Account {
    Account(email: email, created: false)
  }
  func me() async throws -> MeSnapshot { .guest }
  func signOut() async throws {}
  func deleteAccount() async throws {}
}

#Preview("Guest") {
  let state = AppState()
  return NavigationStack {
    AccountView(model: AccountViewModel(auth: PreviewAccountAuthService(), appState: state))
  }
  .environment(state)
}

#Preview("Signed in") {
  let state = AppState()
  state.completeSignIn(email: "ash@pallet.town")
  return NavigationStack {
    AccountView(model: AccountViewModel(auth: PreviewAccountAuthService(), appState: state))
  }
  .environment(state)
}
#endif
