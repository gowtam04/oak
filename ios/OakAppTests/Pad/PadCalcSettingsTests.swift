import Foundation
import SwiftUI
import Testing

@testable import OakApp

/// Pins Pad Calc workspace + Settings contracts for Phase 9 (attacker |
/// defender | visible result; Settings list | detail; OTP as a centered panel).
///
/// `PadCalcChrome` / `PadSettingsChrome` are small pure helpers the Phase 9
/// implementer **must add** under `ios/OakApp/Pad/Calc/` and
/// `ios/OakApp/Pad/Settings/` (`PadCalcWorkspace.swift` /
/// `PadSettingsSplit.swift` or siblings). Missing type / method is the red
/// compile.
///
/// Expected API:
/// ```
/// enum PadCalcChrome {
///   /// Calculator is a workspace, not a sidebar row (P-SHELL-BR-5,
///   /// P-CALC-AC-1.1).
///   static func isSidebarItem() -> Bool // false
///   /// Estimate stays on-screen while editing sides / field (P-CALC-AC-1.2,
///   /// P-CALC-AC-1.3, P-WF-AC-5.1). Layout contract — not a snapshot.
///   static func resultVisibleWithoutScrollingOff() -> Bool // true
/// }
/// enum PadSettingsChrome {
///   /// Leading Settings list | trailing detail page (P-SET-US-1,
///   /// P-SET-AC-1.1).
///   static func showsListAndDetail() -> Bool // true
/// }
/// ```
///
/// Calc drill-in is stored on `PadDestination.calc(CalcScenario?)`.
/// `PadShellModel.openCalc` / `closeCalc` is the chrome write path (Done
/// returns to `previousDestination`). Sidebar highlight is
/// `PadDestination.sidebarTab` — `nil` while Calc is open.
/// `OakAppTab` has no calc case (`AppTabTests` already pins the five-tab
/// catalogue).
///
/// Explain reuses `CalculatorViewModel.explainPrompt` + the calc context
/// chip (`PadContextChipTests`). Do **not** invent calc math or a second
/// estimate payload.
///
/// Not encoded here:
///   P-CALC-AC-1.2 side-by-side editors / 1.3 stacked editors — UI in
///     `PadCalcWorkspace` (the boolean is the result-visibility contract)
///   P-CALC-AC-1.6 entity pickers iPad-sized — UI
///   Calc rolls, Stat Points, incomplete-never-0 — `CalculatorViewModelTests`
///   P-SET-AC-1.2 portrait list-then-detail back control — UI
///   P-SET-AC-2.3 update-available panel — `UpdateViewModelTests`
///   P-SHELL-AC-7.1–7.2 keyboard/trackpad — UI
///   P-REF-AC-1.1 regulation chip display-only — destination chrome
///   Context-chip `apply(to:)` mapping — `PadContextChipTests`
///   iPhone Account/Calc appearance — existing Account/Calc tests
///
/// Requirement refs: P-CALC-US-1, P-CALC-AC-1.1–1.5, P-SET-US-1,
/// P-SET-AC-1.1, P-SET-AC-1.3–1.4, P-SET-AC-2.1–2.2, P-REF-BR-3–4,
/// P-AUTH-US-2, P-AUTH-AC-2.1–2.5, P-AUTH-US-4, P-WF-AC-5.1–5.2,
/// P-WF-AC-10.1–10.2, P-SHELL-BR-5.
@MainActor
struct PadCalcSettingsTests {

  private func makeShell() -> PadShellModel {
    PadShellModel()
  }

  private func makeAccount(
    fake: FakeAuthService = FakeAuthService(),
    appState: AppState = AppState()
  ) -> (AccountViewModel, FakeAuthService, AppState) {
    (AccountViewModel(auth: fake, appState: appState), fake, appState)
  }

  private func signedInState() -> AppState {
    let state = AppState()
    state.completeSignIn(email: "ash@pallet.town")
    return state
  }

  private func completeScenario() -> CalcScenario {
    CalcScenario(
      format: .champions,
      attacker: CalcSide(species: "garchomp", level: 50),
      defender: CalcSide(species: "farigiraf", level: 50),
      move: CalcMove(slug: "earthquake")
    )
  }

  // MARK: Calc is not a sidebar item (P-CALC-AC-1.1, P-SHELL-BR-5)

  @Test
  func calcIsNotASidebarItem() {
    #expect(PadCalcChrome.isSidebarItem() == false)
  }

  @Test
  func calcDestinationHasNoSidebarTab() {
    #expect(PadDestination.calc().sidebarTab == nil)
    #expect(PadDestination.calc(completeScenario()).sidebarTab == nil)
  }

  @Test
  func oakAppTabHasNoCalcCase() {
    #expect(!OakAppTab.allCases.map(\.rawValue).contains("calc"))
    #expect(!OakAppTab.allCases.map(\.rawValue).contains("calculator"))
    #expect(OakAppTab.allCases == [.chat, .teams, .usage, .dex, .settings])
  }

  @Test
  func noSidebarTabOpensTheCalcWorkspace() {
    for tab in OakAppTab.allCases {
      #expect(tab.padDestination.sidebarTab == tab)
      if case .calc = tab.padDestination {
        Issue.record("OakAppTab.\(tab) must not map to PadDestination.calc")
      }
    }
  }

  // MARK: Result stays visible (P-CALC-US-1, P-CALC-AC-1.2–1.3, P-WF-AC-5.1)

  @Test
  func calcResultStaysVisibleWithoutScrollingOff() {
    #expect(PadCalcChrome.resultVisibleWithoutScrollingOff() == true)
  }

  // MARK: Calc workspace open / Done (P-CALC-AC-1.1, P-REF-BR-3)

  @Test
  func calcScenarioRoundTripsOnTheDestination() {
    let scenario = completeScenario()
    let dest = PadDestination.calc(scenario)
    #expect(dest == .calc(scenario))
    guard case .calc(let stored) = dest else {
      Issue.record("expected .calc")
      return
    }
    #expect(stored == scenario)
    #expect(stored?.attacker.species == "garchomp")
    #expect(stored?.defender.species == "farigiraf")
    #expect(stored?.move.slug == "earthquake")
  }

  @Test
  func calcWithNoScenarioRoundTrips() {
    let dest = PadDestination.calc()
    #expect(dest == .calc(nil))
    guard case .calc(let stored) = dest else {
      Issue.record("expected .calc")
      return
    }
    #expect(stored == nil)
  }

  @Test
  func openCalcStoresPreviousDestinationAndCloseReturns() {
    let shell = makeShell()
    shell.select(.dex())
    shell.openCalc(scenario: nil)
    #expect(shell.destination == .calc())
    #expect(shell.previousDestination == .dex())
    #expect(shell.destination.sidebarTab == nil)

    shell.closeCalc()
    #expect(shell.destination == .dex())
    #expect(shell.destination.sidebarTab == .dex)
  }

  @Test
  func closingCalcDoesNotPersistTheWorkspace() {
    // P-REF-BR-3 — calc is ephemeral unless an iPhone pin already exists.
    let scenario = completeScenario()
    let shell = makeShell()
    shell.select(.chat)
    shell.openCalc(scenario: scenario)
    #expect(shell.destination == .calc(scenario))

    shell.closeCalc()
    #expect(shell.destination == .chat)
    #expect(shell.destination != .calc(scenario))
  }

  @Test
  func calcIsPublicForGuests() {
    let shell = makeShell()
    shell.openCalc(scenario: nil)
    #expect(shell.destination == .calc())
    #expect(PadCalcChrome.isSidebarItem() == false)
  }

  // MARK: Prefill carries the scenario (P-CALC-AC-1.5)

  @Test
  func openCalcPrefillStoresTheScenarioOnTheDestination() {
    let scenario = completeScenario()
    let shell = makeShell()
    shell.openCalc(scenario: scenario)
    #expect(shell.destination == .calc(scenario))
    guard case .calc(let stored) = shell.destination else {
      Issue.record("expected .calc")
      return
    }
    #expect(stored?.attacker.species == "garchomp")
    #expect(stored?.defender.species == "farigiraf")
    #expect(stored?.move.slug == "earthquake")
  }

  @Test
  func applyPrefillFillsBothSidesWithoutInventingARoll() {
    let vm = CalculatorViewModel(
      calc: FakeCalcService(),
      format: .champions,
      presentation: .fullScreen
    )
    vm.applyPrefill(completeScenario())
    #expect(vm.scenario.attacker.species == "garchomp")
    #expect(vm.scenario.defender.species == "farigiraf")
    #expect(vm.scenario.move.slug == "earthquake")
    #expect(vm.result == nil)
    #expect(vm.displaysDamageRange == false)
  }

  // MARK: Explain this calc (P-CALC-AC-1.4, P-WF-AC-5.2)

  @Test
  func explainBuildsAPromptWithoutDismissingTheWorkspace() {
    let vm = CalculatorViewModel(
      calc: FakeCalcService(),
      format: .champions,
      presentation: .fullScreen
    )
    vm.applyPrefill(completeScenario())
    let configured = vm.scenario

    let prompt = vm.explainPrompt()

    #expect(prompt != nil)
    #expect(prompt?.isEmpty == false)
    #expect(vm.isPresented)
    #expect(vm.scenario == configured)
  }

  @Test
  func explainOnCalcRevealsCompanionWithTheCalcChip() {
    let vm = CalculatorViewModel(
      calc: FakeCalcService(),
      format: .champions,
      presentation: .fullScreen
    )
    vm.applyPrefill(completeScenario())
    let prompt = vm.explainPrompt() ?? ""

    let shell = makeShell()
    shell.openCalc(scenario: completeScenario())
    shell.revealCompanion()
    shell.setContextChip(.calc(explainPrompt: prompt))

    #expect(shell.destination == .calc(completeScenario()))
    #expect(shell.companionOpen == true)
    #expect(shell.contextChip == .calc(explainPrompt: prompt))
  }

  // MARK: Settings list | detail (P-SET-US-1, P-SET-AC-1.1)

  @Test
  func settingsShowsListAndDetail() {
    #expect(PadSettingsChrome.showsListAndDetail() == true)
  }

  @Test
  func settingsIsASidebarDestination() {
    #expect(OakAppTab.settings.padDestination == .settings)
    #expect(PadDestination.settings.sidebarTab == .settings)
    #expect(OakAppTab.allCases.contains(.settings))
  }

  @Test
  func selectingSettingsFillsTheDestination() {
    let shell = makeShell()
    shell.select(.settings)
    #expect(shell.destination == .settings)
    #expect(shell.destination.sidebarTab == .settings)
  }

  // MARK: Guest vs signed-in rows (P-SET-AC-1.1, P-WF-US-10 empty)

  @Test
  func guestSettingsHasSignInNotDeletionTier() {
    let (vm, _, _) = makeAccount()
    #expect(vm.isSignedIn == false)
    #expect(vm.email == nil)
    #expect(vm.tierTitle == AccountViewModel.guestTierTitle)
    #expect(PadSettingsChrome.showsListAndDetail())
  }

  @Test
  func signedInSettingsHasAccountRows() {
    let (vm, _, _) = makeAccount(appState: signedInState())
    #expect(vm.isSignedIn == true)
    #expect(vm.email == "ash@pallet.town")
    #expect(vm.tierTitle == AccountViewModel.signedInTierTitle)
    #expect(PadSettingsChrome.showsListAndDetail())
  }

  // MARK: Appearance + about (P-SET-AC-1.3–1.4)

  @Test
  func appearanceFollowsSystemLightDark() {
    #expect(AppearancePreference.allCases == [.system, .light, .dark])
    #expect(AppearancePreference.system.colorScheme == nil)
    #expect(AppearancePreference.light.colorScheme == .light)
    #expect(AppearancePreference.dark.colorScheme == .dark)
  }

  @Test
  func aboutLegalLinksRemainReachable() {
    #expect(AccountView.privacyPolicyURL.host == "oak.gowtam.ai")
    #expect(AccountView.privacyPolicyURL.path == "/privacy")
    #expect(AccountView.supportURL.host == "www.gowtam.ai")
  }

  // MARK: No admin on this client (P-REF-BR-4)

  @Test
  func settingsHasNoAdminRole() {
    #expect(!OakAppTab.allCases.map(\.rawValue).contains("admin"))
    let (guest, _, _) = makeAccount()
    #expect(guest.authState == .guest)
    let (signedIn, _, _) = makeAccount(appState: signedInState())
    #expect(signedIn.authState == .signedIn(email: "ash@pallet.town"))
  }

  // MARK: Email OTP centered panel (P-AUTH-US-2, P-SET-AC-2.1, P-AUTH-AC-2.1)

  @Test
  func signInIsEmailThenSixDigitCode() async {
    let (account, fake, state) = makeAccount()
    let auth = account.makeAuthViewModel()
    #expect(auth.step == .email)

    auth.email = "ash@pallet.town"
    await auth.submitEmail()
    #expect(auth.step == .code)
    #expect(fake.requestCodeCount == 1)
    #expect(state.authState == .guest)

    auth.code = "123456"
    #expect(auth.canSubmitCode == true)
  }

  @Test
  func wrongCodeKeepsThePanelOpenWithoutSigningIn() async {
    let fake = FakeAuthService()
    fake.verifyResult = .failure(.http(status: 400, code: "invalid_code", message: "x"))
    let (account, _, state) = makeAccount(fake: fake)
    let auth = account.makeAuthViewModel()
    let shell = makeShell()
    shell.select(.settings)
    shell.centeredPanelPresented = true

    auth.email = "ash@pallet.town"
    await auth.submitEmail()
    auth.code = "000000"
    await auth.submitCode()

    #expect(state.authState == .guest)
    #expect(account.isSignedIn == false)
    #expect(auth.errorMessage != nil)
    #expect(shell.centeredPanelPresented == true)
    #expect(shell.destination == .settings)
  }

  @Test
  func switchingDestinationDismissesOtpWithoutSigningIn() async {
    // P-AUTH-AC-2.5 / P-SHELL-AC-6.1
    let (account, _, state) = makeAccount()
    let auth = account.makeAuthViewModel()
    let shell = makeShell()
    shell.select(.settings)
    shell.centeredPanelPresented = true

    auth.email = "ash@pallet.town"
    await auth.submitEmail()
    #expect(auth.step == .code)
    #expect(state.authState == .guest)

    shell.select(.chat)
    #expect(shell.centeredPanelPresented == false)
    #expect(shell.destination == .chat)
    #expect(state.authState == .guest)
    #expect(account.isSignedIn == false)
  }

  // MARK: Sign-out / deletion confirms (P-SET-AC-2.2, P-AUTH-US-4, P-WF-AC-10.*)

  @Test
  func signOutReturnsToGuestFromSettings() async {
    let (vm, fake, state) = makeAccount(appState: signedInState())
    fake.storedToken = "fake-session-token"
    let shell = makeShell()
    shell.select(.settings)

    await vm.signOut()

    #expect(state.authState == .guest)
    #expect(vm.isSignedIn == false)
    #expect(shell.destination == .settings)
  }

  @Test
  func dismissingDeletionPanelDoesNotDelete() {
    // P-WF-AC-10.2 — destination switch dismisses the confirm; deletion has
    // not run.
    let (vm, fake, state) = makeAccount(appState: signedInState())
    fake.storedToken = "fake-session-token"
    let shell = makeShell()
    shell.select(.settings)
    shell.centeredPanelPresented = true

    shell.select(.chat)

    #expect(shell.centeredPanelPresented == false)
    #expect(fake.deleteCount == 0)
    #expect(state.authState == .signedIn(email: "ash@pallet.town"))
    #expect(vm.isSignedIn == true)
  }

  @Test
  func completedDeletionReturnsToGuest() async {
    let (vm, fake, state) = makeAccount(appState: signedInState())
    fake.storedToken = "fake-session-token"

    await vm.deleteAccount()

    #expect(fake.deleteCount == 1)
    #expect(state.authState == .guest)
    #expect(vm.isSignedIn == false)
  }
}
