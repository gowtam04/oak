import SwiftUI

/// The email-OTP sign-in screen (accounts-and-access.md M-ACCT-US-2). Two steps in
/// one view: collect the email, then the 6-digit code. The code field opts into the
/// system one-time-code autofill (`.textContentType(.oneTimeCode)`, M-AC-2.4) and
/// auto-submits once six digits are present for low-friction entry.
///
/// The view owns its ``AuthViewModel`` (`@State`) and drives it from `Task`s; all
/// logic and error copy live in the view model. Layout uses Dynamic-Type styles and
/// system semantic colors so it adapts to light/dark and text size; error text is
/// paired with an icon so color is never the sole signal (M-AC-UI9.3).
///
/// Chrome: a custom `ScrollView` layout replaces the `Form` — a `Sign in` title,
/// a floating email field, a filled-capsule CTA with an in-button spinner, and a
/// six-box code entry. The **code boxes** are a purely
/// visual layer over a single, near-invisible real `TextField` that keeps
/// `.textContentType(.oneTimeCode)` + `.keyboardType(.numberPad)`, so system OTP
/// autofill and the number pad keep working exactly as before; the boxes just render
/// `model.code`'s characters and route taps to focus that hidden field. VoiceOver
/// reads the whole code entry as ONE element ("Enter 6 digit code, N of 6 entered").
///
/// **Accessibility (constraint 2):** every animation is gated on
/// `@Environment(\.accessibilityReduceMotion)` — the step slide and error shake fall
/// back to no movement, the success checkmark draws instantly, and the focus/digit
/// springs are dropped.
///
/// Presentation (where this surfaces in the app) is wired by the Account feature; the
/// view is presenter-agnostic and self-contained. On success ``AppState`` flips to
/// signed-in and the presenting sheet auto-dismisses (AccountView owns that).
struct AuthView: View {
  @State private var model: AuthViewModel
  @FocusState private var focusedField: Field?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Bumped to fire the code-row shake keyframe animation on an error.
  @State private var shakeTrigger = 0

  private enum Field: Hashable {
    case email
    case code
  }

  init(model: AuthViewModel) {
    _model = State(initialValue: model)
  }

  var body: some View {
    @Bindable var model = model
    NavigationStack {
      ScrollView {
        VStack(spacing: 28) {
          header
          if let email = model.signedInEmail {
            successView(email: email)
              .transition(.opacity)
          } else {
            stepContent(emailText: $model.email, codeText: $model.code)
              .transition(.opacity)
          }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .oakCard()
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 40)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(Theme.canvas)
      .navigationTitle("Sign in")
      .navigationBarTitleDisplayMode(.inline)
      // Success ↔ flow crossfade (checkmark draw handled inside successView).
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.signedInEmail)
      // An error during the code step shakes the boxes + fires an error haptic.
      .onChange(of: model.errorMessage) { _, newValue in
        guard model.step == .code, newValue != nil else { return }
        Haptics.error()
        if !reduceMotion { shakeTrigger += 1 }
      }
    }
    .oakEnamelNav()
  }

  // MARK: Header

  private var header: some View {
    VStack(spacing: 12) {
      Text("Sign in")
        .font(Theme.display(.title))
        .foregroundStyle(Theme.textStrong)
      Text("Save your conversations and teams")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: Step container (email ↔ code directional slide)

  @ViewBuilder
  private func stepContent(emailText: Binding<String>, codeText: Binding<String>) -> some View {
    Group {
      switch model.step {
      case .email:
        emailStep(emailText: emailText)
          .transition(stepTransition)
      case .code:
        codeStep(codeText: codeText)
          .transition(stepTransition)
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.step)
  }

  /// Email→code slides in from the trailing edge, back slides from leading. Reduce
  /// Motion collapses both to a plain crossfade.
  private var stepTransition: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(
      insertion: .move(edge: .trailing).combined(with: .opacity),
      removal: .move(edge: .leading).combined(with: .opacity)
    )
  }

  // MARK: Email step

  @ViewBuilder
  private func emailStep(emailText: Binding<String>) -> some View {
    VStack(spacing: 16) {
      TextField("you@example.com", text: emailText)
        .textContentType(.emailAddress)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.send)
        .font(Theme.body(.body))
        .foregroundStyle(Theme.textPrimary)
        .tint(Theme.accent)
        .focused($focusedField, equals: .email)
        .onSubmit { Task { await model.submitEmail() } }
        .modifier(FloatingFieldChrome(focused: focusedField == .email, reduceMotion: reduceMotion))

      Text("We'll email you a 6-digit code. No password needed.")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)

      messageBlock

      primaryButton(title: "Send code", enabled: model.canSubmitEmail) {
        Task { await model.submitEmail() }
      }
    }
    .onAppear { focusedField = .email }
  }

  // MARK: Code step

  @ViewBuilder
  private func codeStep(codeText: Binding<String>) -> some View {
    VStack(spacing: 20) {
      Text("Enter the 6-digit code we sent to \(model.normalizedEmail).")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)

      codeBoxes(codeText: codeText)

      messageBlock

      primaryButton(title: "Verify", enabled: model.canSubmitCode) {
        Task { await model.submitCode() }
      }

      resendControls
    }
    .onAppear { focusedField = .code }
  }

  /// The six-box code entry. The six boxes are a purely decorative display layer
  /// (`.allowsHitTesting(false)`) showing `model.code`'s digits; a single real
  /// `TextField` is overlaid on TOP, stretched transparently across the whole box
  /// area, so it — not the boxes — receives every touch. That's what lets a
  /// long-press summon the system Paste menu (the old 1×1 field + a tap-gesture on
  /// the box layer swallowed long-presses, so Paste never appeared). The field
  /// keeps `.textContentType(.oneTimeCode)` + `.keyboardType(.numberPad)` so OTP
  /// autofill and the number pad work exactly as before; its caret/text are made
  /// invisible (`.foregroundStyle(.clear)` + `.tint(.clear)` + a low opacity) so no
  /// artifacts leak over the rendered digits. The TextField is the accessible
  /// element (VoiceOver reads the whole entry as one), the boxes are decorative.
  private func codeBoxes(codeText: Binding<String>) -> some View {
    // The visual digit boxes — decorative, non-interactive so touches fall through
    // to the real field layered above.
    HStack(spacing: 10) {
      ForEach(0..<6, id: \.self) { index in
        digitBox(index: index)
      }
    }
    // Error shake: ±8pt over 3 oscillations, driven by shakeTrigger (never bumped
    // under Reduce Motion, so this stays still there).
    .keyframeAnimator(initialValue: CGFloat(0), trigger: shakeTrigger) { view, offset in
      view.offset(x: offset)
    } keyframes: { _ in
      KeyframeTrack {
        CubicKeyframe(-8, duration: 0.06)
        CubicKeyframe(8, duration: 0.10)
        CubicKeyframe(-8, duration: 0.10)
        CubicKeyframe(8, duration: 0.10)
        CubicKeyframe(0, duration: 0.06)
      }
    }
    .allowsHitTesting(false)
    .overlay {
      // The real input, stretched over the entire boxes area so a long-press
      // anywhere on the row can raise the Paste menu. Text + caret are clear so the
      // boxes below stay the only visible digits; a low (non-zero) opacity keeps the
      // field interactive (a fully transparent field can be treated as inert).
      TextField("", text: codeText)
        .textContentType(.oneTimeCode)
        .keyboardType(.numberPad)
        .focused($focusedField, equals: .code)
        .multilineTextAlignment(.center)
        .foregroundStyle(.clear)
        .tint(.clear)
        .opacity(0.02)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        // OTP autofill (and a paste) can drop all six digits at once — verify
        // automatically once six are present (same behavior as before the redesign;
        // the VM sanitizes a pasted value down to six digits first).
        .onChange(of: model.code) { _, newValue in
          if newValue.count == 6 { Task { await model.submitCode() } }
        }
        // The field is the single VoiceOver element for the whole code entry
        // (M-AC-UI9.1); the boxes above are decorative.
        .accessibilityLabel("Enter 6 digit code")
        .accessibilityValue("\(min(model.code.count, 6)) of 6 entered")
    }
    .frame(height: 56)
  }

  /// One digit cell. Renders `model.code`'s character at `index` (display capped at 6
  /// defensively); the active cell (next empty slot while focused) gets a **poke-red**
  /// focus border + 18% red halo. Digits are JetBrains Mono; they pop in with a scale
  /// spring.
  private func digitBox(index: Int) -> some View {
    let digits = Array(model.code.prefix(6))
    let hasDigit = index < digits.count
    let isActive = focusedField == .code && index == digits.count && digits.count < 6
    return RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
      .fill(Theme.surface)
      .frame(width: 44, height: 56)
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(isActive ? Theme.accent : Theme.borderStrong, lineWidth: isActive ? 2 : 1)
      }
      .overlay {
        if hasDigit {
          Text(String(digits[index]))
            .font(Theme.mono(.title2, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
            .transition(reduceMotion ? .opacity : .scale(scale: 0.5).combined(with: .opacity))
        }
      }
      .shadow(color: isActive && !reduceMotion ? Theme.accent.opacity(0.18) : .clear, radius: 4)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.code)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: isActive)
      .accessibilityHidden(true)
  }

  // MARK: Resend + change-email controls

  private var resendControls: some View {
    VStack(spacing: 12) {
      // The cooldown ticks via TimelineView so the countdown updates each second
      // without the view model holding a timer.
      TimelineView(.periodic(from: .now, by: 1)) { _ in
        if model.canResend {
          Button("Resend code") {
            Task { await model.resendCode() }
          }
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.accent)
        } else {
          Text("Resend available in \(model.resendSecondsRemaining)s")
            .font(Theme.body(.subheadline))
            .foregroundStyle(Theme.textSecondary)
            .contentTransition(.numericText())
            .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.resendSecondsRemaining)
        }
      }

      Button("Use a different email") {
        model.editEmail()
      }
      .font(Theme.body(.subheadline))
      .foregroundStyle(Theme.textSecondary)
    }
  }

  // MARK: Success (drawn checkmark)

  private func successView(email: String) -> some View {
    VStack(spacing: 16) {
      DrawnCheckmark(animate: !reduceMotion)
        .frame(width: 72, height: 72)
      Text("Signed in")
        .font(Theme.display(.title3))
      Text(email)
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 8)
    .onAppear { Haptics.success() }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Signed in as \(email)")
  }

  // MARK: Shared pieces

  /// A full-width filled-accent capsule CTA. Shows an in-button spinner while a
  /// request is in flight; dims (but stays lit while busy) when disabled. Press
  /// feedback + Reduce-Motion handling come from `OakPressableButtonStyle`.
  private func primaryButton(
    title: String, enabled: Bool, action: @escaping () -> Void
  ) -> some View {
    let isActive = enabled || model.isBusy
    return Button(action: action) {
      ZStack {
        Text(title)
          .font(Theme.display(.headline))
          .opacity(model.isBusy ? 0 : 1)
        if model.isBusy {
          ProgressView()
            .tint(.white)
        }
      }
      .foregroundStyle(isActive ? Theme.onRed : Theme.textMuted)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .background(isActive ? Theme.accent : Theme.surfaceSunken, in: Capsule())
    }
    .buttonStyle(OakPressableButtonStyle())
    .disabled(!enabled)
  }

  /// Error (with a warning icon) and neutral notice rows; rendered only when set.
  @ViewBuilder
  private var messageBlock: some View {
    if let errorMessage = model.errorMessage {
      // A dangerSoft callout strip with a 3pt danger rail (web callout recipe, §5.5).
      Label {
        Text(errorMessage)
          .foregroundStyle(Theme.textPrimary)
      } icon: {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(Theme.danger)
      }
      .font(Theme.body(.footnote))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.md)
      .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
      .overlay(alignment: .leading) {
        Rectangle().fill(Theme.danger).frame(width: 3)
      }
      .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
    if let noticeMessage = model.noticeMessage {
      Label {
        Text(noticeMessage)
          .foregroundStyle(Theme.textSecondary)
      } icon: {
        Image(systemName: "envelope.fill")
          .foregroundStyle(Theme.info)
      }
      .font(Theme.body(.footnote))
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

// MARK: - Floating field chrome

/// The rounded, filled text-field chrome with an animated focus border — **poke-red**
/// when focused (composer recipe), hairline otherwise. The border transition is
/// dropped under Reduce Motion.
private struct FloatingFieldChrome: ViewModifier {
  let focused: Bool
  let reduceMotion: Bool

  func body(content: Content) -> some View {
    content
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
          .strokeBorder(
            focused ? Theme.accent : Theme.borderStrong,
            lineWidth: focused ? 1.5 : 1
          )
      }
      .shadow(color: focused ? Theme.accent.opacity(0.18) : .clear, radius: 4)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: focused)
  }
}

// MARK: - Drawn checkmark

/// A success mark that draws itself in: a trimmed ring stroke plus a trimmed
/// checkmark, both animating their `trim(to:)` from 0→1. Draws instantly under
/// Reduce Motion. Decorative — the surrounding view carries the "Signed in" meaning,
/// so it's hidden from VoiceOver (M-AC-UI9.3).
private struct DrawnCheckmark: View {
  let animate: Bool
  @State private var progress: CGFloat = 0

  var body: some View {
    ZStack {
      Circle()
        .stroke(Theme.success.opacity(0.25), lineWidth: 3)
      Circle()
        .trim(from: 0, to: progress)
        .stroke(Theme.success, style: StrokeStyle(lineWidth: 3, lineCap: .round))
        .rotationEffect(.degrees(-90))
      CheckmarkShape()
        .trim(from: 0, to: progress)
        .stroke(Theme.success, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        .padding(20)
    }
    .onAppear {
      if animate {
        withAnimation(.easeInOut(duration: 0.5)) { progress = 1 }
      } else {
        progress = 1
      }
    }
    .accessibilityHidden(true)
  }
}

/// The checkmark tick, drawn in the unit rect so `trim` animates it as one stroke.
private struct CheckmarkShape: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + rect.height * 0.05))
    path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.38, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    return path
  }
}

#if DEBUG
/// A preview-only ``AuthService`` so the canvas renders without the network.
private struct PreviewAuthService: AuthService {
  func requestCode(email: String) async throws {}
  func verify(email: String, code: String) async throws -> Account {
    Account(email: email, created: false)
  }
  func me() async throws -> MeSnapshot { .guest }
  func signOut() async throws {}
  func deleteAccount() async throws {}
  func setAnswerDensity(_ density: AnswerDensity) async throws -> AnswerDensity { density }
}

#Preview("Sign in") {
  AuthView(model: AuthViewModel(auth: PreviewAuthService(), appState: AppState()))
}
#endif
