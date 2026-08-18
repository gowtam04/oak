import Foundation
import Testing

@testable import OakApp

/// Phase 7 lockstep oracle — `CalcScenario` / `CalcResult` wire + portable
/// helpers (`defaultCalcLevel`, `explainCalcPrompt`).
///
/// Clones `web/src/lib/calc/calc-schema.test.ts`, `default-level.test.ts`,
/// and `explain-prompt.test.ts`. Production `CalcWire.swift` does not exist
/// yet — compile-fail is the intended red (P7 implementer).
///
/// Expected API (`ios/OakApp/Models/Wire/CalcWire.swift` + calc helpers):
///   `CalcScenario(format:attacker:defender:move:field:)`
///   `CalcSide` — species/ability/item/nature/evs/ivs/tera/level (all optional)
///   `CalcMove` — slug/name/power/type/category
///   `CalcField` — weather (none|sun|rain|sand|snow), reflect, lightScreen
///   `CalcResult.success(CalcSuccess)` | `.failure(CalcFailure)`
///   `CalcSuccess.estimate.isEstimate == true`, `applied.unsupported: [String]`
///   `CalcFailure.error`: incomplete | unresolved | indexUnavailable | statusMove
///   `defaultCalcLevel(_ format: Format) -> Int`
///   `explainCalcPrompt(scenario:result:) -> String`
///   `CalcEndpoints.estimate(_:)` → `POST /api/calc`, public (`requiresAuth: false`)
///
/// Incomplete sides still construct so the engine can return 200 `incomplete`
/// instead of inventing a 0 roll (CALC-BR-8).
///
/// Requirement refs: CALC-US-4, CALC-US-5, CALC-US-7, CALC-US-8, CALC-AC-4.1,
/// CALC-AC-4.4, CALC-AC-5.1, CALC-AC-5.4, CALC-AC-7.1, CALC-BR-2, CALC-BR-7,
/// CALC-BR-8. ADR-13.
struct CalcWireTests {

  private var validScenario: CalcScenario {
    CalcScenario(
      format: .scarletViolet,
      attacker: CalcSide(species: "garchomp"),
      defender: CalcSide(species: "farigiraf"),
      move: CalcMove(slug: "earthquake")
    )
  }

  private var validSuccess: CalcSuccess {
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
      breakdown: "floor(base × roll × STAB × type × other)",
      applied: CalcApplied(
        stab: true,
        typeEffectiveness: 1,
        otherModifier: 1,
        unsupported: []
      )
    )
  }

  // MARK: CALC-US-4 / CALC-AC-4.1 — scenario shape

  @Test
  func constructsAValidScenarioWithFormatSidesAndMove() {
    let scenario = validScenario
    #expect(scenario.format == .scarletViolet)
    #expect(scenario.attacker.species == "garchomp")
    #expect(scenario.defender.species == "farigiraf")
    #expect(scenario.move.slug == "earthquake")
  }

  @Test
  func acceptsTheDocumentedOptionalSetAndFieldKnobs() {
    let scenario = CalcScenario(
      format: .champions,
      attacker: CalcSide(
        species: "garchomp",
        ability: "rough-skin",
        item: "life-orb",
        nature: "jolly",
        evs: ["hp": 4],
        ivs: ["hp": 31],
        tera: "ground",
        level: 50
      ),
      defender: CalcSide(
        species: "garchomp",
        ability: nil,
        item: nil,
        nature: nil,
        tera: nil
      ),
      move: CalcMove(
        slug: "earthquake",
        name: "Earthquake",
        power: 100,
        type: "ground",
        category: .physical
      ),
      field: CalcField(weather: .sand, reflect: false, lightScreen: true)
    )
    #expect(scenario.format == .champions)
    #expect(scenario.attacker.item == "life-orb")
    #expect(scenario.move.category == .physical)
    #expect(scenario.field?.weather == .sand)
    #expect(scenario.field?.lightScreen == true)
  }

  @Test
  func stillConstructsWhenASideSpeciesOrMoveIdentityIsOmitted() {
    // CALC-BR-8 / CALC-AC-5.4 — incomplete input is a constructible scenario so
    // the engine can return 200 `{ ok: false, error: "incomplete" }`.
    let missingAttacker = CalcScenario(
      format: .scarletViolet,
      attacker: CalcSide(),
      defender: CalcSide(species: "farigiraf"),
      move: CalcMove(slug: "earthquake")
    )
    let missingDefender = CalcScenario(
      format: .scarletViolet,
      attacker: CalcSide(species: "garchomp"),
      defender: CalcSide(),
      move: CalcMove(slug: "earthquake")
    )
    let missingMove = CalcScenario(
      format: .scarletViolet,
      attacker: CalcSide(species: "garchomp"),
      defender: CalcSide(species: "farigiraf"),
      move: CalcMove()
    )
    #expect(missingAttacker.attacker.species == nil)
    #expect(missingDefender.defender.species == nil)
    #expect(missingMove.move.slug == nil)
    #expect(missingMove.move.name == nil)
  }

  @Test
  func acceptsEveryKnownOakFormat() {
    for format in Format.knownCases {
      let scenario = CalcScenario(
        format: format,
        attacker: CalcSide(species: "garchomp"),
        defender: CalcSide(species: "farigiraf"),
        move: CalcMove(slug: "earthquake")
      )
      #expect(scenario.format == format)
    }
  }

  // MARK: CALC-AC-4.4 / CALC-AC-5.1 / CALC-BR-2 — success result

  @Test
  func successResultCarriesEstimateFlagAndUnsupportedList() {
    let result = CalcResult.success(validSuccess)
    guard case .success(let ok) = result else {
      Issue.record("expected success")
      return
    }
    #expect(ok.estimate.isEstimate == true)
    #expect(ok.estimate.minDamage == 100)
    #expect(ok.estimate.maxDamage == 120)
    #expect(ok.estimate.percentMin == 30)
    #expect(ok.estimate.percentMax == 36)
    #expect(ok.estimate.ko.hits == 3)
    #expect(ok.applied.unsupported.isEmpty)
  }

  @Test
  func successEstimateIsAlwaysMarkedEstimate() {
    #expect(validSuccess.estimate.isEstimate == true)
  }

  @Test
  func incompleteErrorShapeDoesNotCarryADamageRange() {
    let result = CalcResult.failure(CalcFailure(error: .incomplete))
    guard case .failure(let miss) = result else {
      Issue.record("expected failure")
      return
    }
    #expect(miss.error == .incomplete)
    #expect(miss.estimate == nil)
  }

  @Test
  func otherDocumentedInDomainErrorsParseAsFailures() {
    for code in [
      CalcErrorCode.unresolved,
      .indexUnavailable,
      .statusMove,
    ] {
      let result = CalcResult.failure(CalcFailure(error: code))
      guard case .failure(let miss) = result else {
        Issue.record("expected failure for \(code)")
        continue
      }
      #expect(miss.error == code)
    }
  }

  @Test
  func successAcceptsOptionalCommonSpreadsAndCaveat() {
    let ok = CalcSuccess(
      format: .gen1,
      estimate: validSuccess.estimate,
      breakdown: "estimate",
      applied: validSuccess.applied,
      commonSpreads: [
        CalcCommonSpread(
          label: .min,
          estimate: CalcSpreadEstimate(
            minDamage: 80, maxDamage: 96, percentMin: 40, percentMax: 48, ko: CalcKo(hits: 3)
          )
        ),
        CalcCommonSpread(
          label: .bulky,
          estimate: CalcSpreadEstimate(
            minDamage: 60, maxDamage: 72, percentMin: 25, percentMax: 30, ko: CalcKo(hits: 4)
          )
        ),
        CalcCommonSpread(
          label: .max,
          estimate: CalcSpreadEstimate(
            minDamage: 50, maxDamage: 60, percentMin: 20, percentMax: 24, ko: CalcKo(hits: 5)
          )
        ),
      ],
      caveat: "modern_estimate"
    )
    #expect(ok.caveat == "modern_estimate")
    #expect(ok.commonSpreads?.count == 3)
    #expect(ok.commonSpreads?.first?.label == .min)
  }

  // MARK: CALC-US-7 / CALC-AC-7.1 / CALC-BR-7 — default level

  @Test
  func defaultLevelIs50ForChampionsAnd100Otherwise() {
    #expect(defaultCalcLevel(.champions) == 50)
    for format in Format.knownCases where format != .champions {
      #expect(defaultCalcLevel(format) == 100, "\(format.rawValue) defaults to 100")
    }
    #expect(Format.knownCases.contains(.champions))
    #expect(Format.knownCases.count == 11)
  }

  // MARK: CALC-US-8 — explain prompt

  @Test
  func explainPromptIsADeterministicChatMessageNotJSON() {
    let scenario = CalcScenario(
      format: .scarletViolet,
      attacker: CalcSide(
        species: "garchomp",
        ability: "rough-skin",
        item: "life-orb",
        nature: "jolly",
        evs: ["atk": 252, "spe": 252, "hp": 4],
        tera: "ground",
        level: 100
      ),
      defender: CalcSide(
        species: "farigiraf",
        ability: "armor-tail",
        item: "leftovers",
        nature: "modest",
        evs: ["hp": 252, "spd": 252],
        tera: "fairy",
        level: 100
      ),
      move: CalcMove(slug: "earthquake", name: "Earthquake"),
      field: CalcField(weather: .sun, reflect: true, lightScreen: false)
    )
    let prompt = explainCalcPrompt(scenario: scenario, result: .success(validSuccess))

    #expect(prompt.hasPrefix("Explain this damage estimate (do not re-roll unless needed)."))
    #expect(prompt.contains("Format: scarlet-violet"))
    #expect(prompt.contains("Attacker:"))
    #expect(prompt.localizedCaseInsensitiveContains("garchomp"))
    #expect(prompt.localizedCaseInsensitiveContains("life-orb"))
    #expect(prompt.localizedCaseInsensitiveContains("rough-skin"))
    #expect(prompt.contains("L100"))
    #expect(prompt.localizedCaseInsensitiveContains("Tera ground"))
    #expect(prompt.contains("Defender:"))
    #expect(prompt.localizedCaseInsensitiveContains("farigiraf"))
    #expect(prompt.contains("Move:"))
    #expect(prompt.localizedCaseInsensitiveContains("earthquake"))
    #expect(prompt.contains("Field:"))
    #expect(prompt.localizedCaseInsensitiveContains("sun"))
    #expect(prompt.contains("Reflect"))
    #expect(prompt.contains("Estimate:"))
    #expect(prompt.contains("100"))
    #expect(prompt.contains("120"))
    #expect(prompt.contains("Unsupported:"))
    #expect(prompt.contains("\n"))
    #expect((try? JSONSerialization.jsonObject(with: Data(prompt.utf8))) == nil)
  }

  // MARK: POST /api/calc endpoint (CALC-BR-1 — no model)

  @Test
  func calcEstimateEndpointIsPublicPost() throws {
    let endpoint = CalcEndpoints.estimate(validScenario)
    #expect(endpoint.method == .post)
    #expect(endpoint.path == "/api/calc")
    #expect(endpoint.requiresAuth == false)

    let request = try endpoint.urlRequest(
      baseURL: URL(string: "https://oak.example.com")!,
      token: nil,
      encoder: JSONEncoder()
    )
    #expect(request.url?.path == "/api/calc")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
  }
}
