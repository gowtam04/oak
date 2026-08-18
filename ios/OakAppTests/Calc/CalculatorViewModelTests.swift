import Foundation
import Testing

@testable import OakApp

/// `CalculatorViewModel` — overlay vs first-class screen, Explain does not
/// dismiss, incomplete input never invents a 0 roll (CALC-US-1/2/5/8, CALC-BR-1/8).
///
/// Expected API (`ios/OakApp/Features/Calc/CalculatorViewModel.swift`):
///   `CalculatorViewModel(calc:format:presentation:)`
///   `presentation`: `.overlay` | `.fullScreen`
///   `scenario`, `result`, `isIncomplete`, `isPresented`, `displaysDamageRange`
///   `applyPrefill(_:)`, `applySlashRest(_:)`, `expandToFullScreen()`, `dismiss()`
///   `explainPrompt() -> String?` — builds the deterministic message; does NOT
///     dismiss or reset (CALC-AC-8.2)
///   `recompute() async` — POST /api/calc via `CalcService`; no model
///
/// Compile-fail until the P7 implementer adds the VM.
///
/// Requirement refs: CALC-US-1, CALC-US-2, CALC-AC-2.3, CALC-AC-2.4, CALC-AC-5.3,
/// CALC-AC-5.4, CALC-AC-8.1, CALC-AC-8.2, CALC-BR-1, CALC-BR-8.
@MainActor
struct CalculatorViewModelTests {

  private func makeVM(
    format: Format = .scarletViolet,
    presentation: CalculatorViewModel.Presentation = .overlay,
    fake: FakeCalcService = FakeCalcService()
  ) -> (CalculatorViewModel, FakeCalcService) {
    (CalculatorViewModel(calc: fake, format: format, presentation: presentation), fake)
  }

  private func completeScenario(format: Format = .scarletViolet) -> CalcScenario {
    CalcScenario(
      format: format,
      attacker: CalcSide(species: "garchomp"),
      defender: CalcSide(species: "farigiraf"),
      move: CalcMove(slug: "earthquake")
    )
  }

  private func successResult() -> CalcResult {
    .success(
      CalcSuccess(
        format: .scarletViolet,
        estimate: CalcEstimate(
          minDamage: 100,
          maxDamage: 120,
          percentMin: 30,
          percentMax: 36,
          ko: CalcKo(hits: 3),
          isEstimate: true
        ),
        breakdown: "estimate",
        applied: CalcApplied(
          stab: true,
          typeEffectiveness: 1,
          otherModifier: 1,
          unsupported: []
        )
      )
    )
  }

  // MARK: CALC-US-1 / CALC-AC-1.1 — first-class empty sides

  @Test
  func standaloneOpensWithEmptySidesAndInheritedFormat() {
    let (vm, _) = makeVM(format: .gen7, presentation: .fullScreen)

    #expect(vm.presentation == .fullScreen)
    #expect(vm.scenario.format == .gen7)
    #expect(vm.scenario.attacker.species == nil)
    #expect(vm.scenario.defender.species == nil)
    #expect(vm.scenario.move.slug == nil)
    #expect(vm.isIncomplete)
    #expect(vm.displaysDamageRange == false)
    #expect(vm.result == nil || vm.result?.isIncomplete == true)
  }

  // MARK: CALC-US-2 — overlay hops

  @Test
  func overlayPrefillFromADamageBlockFillsBothSides() {
    let (vm, _) = makeVM(format: .nationalDex, presentation: .overlay)
    let hop = completeScenario(format: .champions)

    vm.applyPrefill(hop)

    #expect(vm.presentation == .overlay)
    #expect(vm.isPresented)
    #expect(vm.scenario.format == .champions)
    #expect(vm.scenario.attacker.species == "garchomp")
    #expect(vm.scenario.defender.species == "farigiraf")
    #expect(vm.scenario.move.slug == "earthquake")
  }

  @Test
  func expandCarriesTheSameScenarioToFullScreen() {
    let (vm, _) = makeVM(presentation: .overlay)
    vm.applyPrefill(completeScenario())
    let before = vm.scenario

    vm.expandToFullScreen()

    #expect(vm.presentation == .fullScreen)
    #expect(vm.scenario == before)
    #expect(vm.isPresented)
  }

  @Test
  func dismissDoesNotSendAChatTurn() {
    let (vm, fake) = makeVM(presentation: .overlay)
    vm.applyPrefill(completeScenario())

    vm.dismiss()

    #expect(vm.isPresented == false)
    #expect(fake.estimateCount == 0)
  }

  @Test
  func slashRestOpensTheOverlayEvenWhenTokensAreUnresolved() {
    let (vm, _) = makeVM(presentation: .overlay)

    vm.applySlashRest("not-a-species vs also-fake")

    #expect(vm.isPresented)
    #expect(vm.slashRest == "not-a-species vs also-fake")
    #expect(vm.errorMessage == nil)
  }

  // MARK: CALC-US-8 / CALC-AC-8.2 — Explain does not dismiss

  @Test
  func explainBuildsAPromptAndLeavesTheOverlayConfigured() {
    let (vm, _) = makeVM(presentation: .overlay)
    vm.applyPrefill(completeScenario())
    let configured = vm.scenario

    let prompt = vm.explainPrompt()

    #expect(prompt != nil)
    #expect(prompt?.hasPrefix("Explain this damage estimate") == true)
    #expect(vm.isPresented)
    #expect(vm.presentation == .overlay)
    #expect(vm.scenario == configured)
  }

  // MARK: CALC-AC-5.4 / CALC-BR-8 — incomplete never invents a 0

  @Test
  func incompleteInputDoesNotDisplayAFakeZeroRange() async {
    let fake = FakeCalcService()
    fake.handler = { scenario in
      if scenario.attacker.species == nil
        || scenario.defender.species == nil
        || (scenario.move.slug == nil && scenario.move.name == nil)
      {
        return .failure(CalcFailure(error: .incomplete))
      }
      return nil
    }
    let (vm, _) = makeVM(fake: fake)

    await vm.recompute()

    #expect(vm.isIncomplete)
    #expect(vm.displaysDamageRange == false)
    #expect(vm.displayedMinDamage == nil)
    #expect(vm.displayedMaxDamage == nil)
    if case .success(let ok) = vm.result {
      Issue.record("incomplete must not produce a success range, got \(ok.estimate)")
    }
  }

  @Test
  func statusMoveDoesNotInventADamageRange() async {
    let fake = FakeCalcService(
      nextResult: .failure(CalcFailure(error: .statusMove, detail: "Thunder Wave deals no damage."))
    )
    let (vm, _) = makeVM(fake: fake)
    vm.applyPrefill(
      CalcScenario(
        format: .scarletViolet,
        attacker: CalcSide(species: "pikachu"),
        defender: CalcSide(species: "garchomp"),
        move: CalcMove(slug: "thunder-wave", category: .status)
      )
    )

    await vm.recompute()

    #expect(vm.displaysDamageRange == false)
    guard case .failure(let miss) = vm.result else {
      Issue.record("expected status_move failure")
      return
    }
    #expect(miss.error == .statusMove)
  }

  @Test
  func aCompleteMatchupShowsAnEstimateNotAnExact() async {
    let fake = FakeCalcService(nextResult: successResult())
    let (vm, _) = makeVM(fake: fake)
    vm.applyPrefill(completeScenario())

    await vm.recompute()

    #expect(vm.isIncomplete == false)
    #expect(vm.displaysDamageRange)
    guard case .success(let ok) = vm.result else {
      Issue.record("expected a success estimate")
      return
    }
    #expect(ok.estimate.isEstimate)
    #expect(ok.estimate.minDamage == 100)
    #expect(ok.estimate.maxDamage == 120)
    #expect(fake.estimateCount == 1)
  }

  @Test
  func recomputeNeverTouchesTheChatService() async {
    // CALC-BR-1 — opening / editing / displaying rolls never calls the agent.
    let fake = FakeCalcService(nextResult: successResult())
    let (vm, _) = makeVM(fake: fake)
    vm.applyPrefill(completeScenario())
    await vm.recompute()
    let prompt = vm.explainPrompt()

    #expect(fake.estimateCount == 1)
    #expect(prompt != nil)
    #expect(vm.isPresented)
  }
}
