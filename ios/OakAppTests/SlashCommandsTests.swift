import Foundation
import Testing

@testable import OakApp

/// Phase 5/7 lockstep oracle — leading-token slash parse on send.
///
/// Clones `web/src/lib/chat/slash-commands.test.ts`. The parser only
/// classifies; it does not POST `/api/chat`.
///
/// Expected API (web `parseSlashCommand`):
///   `SlashCommands.parse(_ text: String, hasUsagePage: Bool) -> SlashCommand`
///   `SlashCommand.navigate(target:)` | `.calc(rest:)` | `.message`
///   `SlashCommand.Target` = `new` | `team` | `dex` | `usage`
///
/// `/calc` is a handled slash in this pack (CALC-AC-3.4 / ADR-4). `rest` is
/// the substring after `/calc`, trimmed. Empty rest → open overlay, current
/// scope. Non-empty rest is still `.calc` (unresolved tokens are a UI concern,
/// CALC-AC-3.3). `/compare` stays a normal message (CMP-BR-3).
///
/// Fails to compile until `SlashCommand` grows `.calc(rest:)`
/// (`ios/OakApp/Features/Chat/SlashCommands.swift`).
///
/// iOS has no usage surface — callers pass `hasUsagePage: false`.
/// `/usage` is therefore a normal message (SLASH-AC-1.4 / SLASH-AC-1.5).
/// No palette / shortcuts (NAV-US-1/2 are web-only).
///
/// Known leading tokens: `/new`, `/team`, `/dex`, `/calc`, and `/usage` only
/// when `hasUsagePage == true`. First whitespace-delimited token wins; args
/// stay on the navigate result (client routes `/team {name}` / `/dex {name}`).
/// Unknown slashes — including `/compare` and `/usage` when the client has no
/// usage page — are ordinary messages.
///
/// Requirement refs: SLASH-US-1, SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2,
/// CALC-US-3, CALC-AC-3.1..3.4, CALC-BR-4. ADR-4, ADR-10.
struct SlashCommandsTests {

  /// Web lockstep option — usage page exists.
  private let webHasUsagePage = true
  /// iOS / Android — no usage page.
  private let nativeHasUsagePage = false

  private func parse(_ text: String, hasUsagePage: Bool) -> SlashCommand {
    SlashCommands.parse(text, hasUsagePage: hasUsagePage)
  }

  // MARK: SLASH-AC-1.1 — /new

  @Test
  func navigatesNewToANewEmptyChat() {
    #expect(parse("/new", hasUsagePage: webHasUsagePage) == .navigate(target: .new))
    #expect(parse("/new", hasUsagePage: nativeHasUsagePage) == .navigate(target: .new))
  }

  @Test
  func treatsNewWithArgsAsNavigateNew() {
    #expect(
      parse("/new rain team", hasUsagePage: webHasUsagePage) == .navigate(target: .new)
    )
    #expect(
      parse("/new rain team", hasUsagePage: nativeHasUsagePage) == .navigate(target: .new)
    )
  }

  // MARK: SLASH-AC-1.2 — /team

  @Test
  func navigatesTeamAndTeamName() {
    #expect(parse("/team", hasUsagePage: webHasUsagePage) == .navigate(target: .team))
    #expect(
      parse("/team Rain Offense", hasUsagePage: webHasUsagePage) == .navigate(target: .team)
    )
    #expect(parse("/team", hasUsagePage: nativeHasUsagePage) == .navigate(target: .team))
    #expect(
      parse("/team Rain Offense", hasUsagePage: nativeHasUsagePage)
        == .navigate(target: .team)
    )
  }

  // MARK: SLASH-AC-1.3 — /dex

  @Test
  func navigatesDexAndDexName() {
    #expect(parse("/dex", hasUsagePage: webHasUsagePage) == .navigate(target: .dex))
    #expect(
      parse("/dex garchomp", hasUsagePage: webHasUsagePage) == .navigate(target: .dex)
    )
    #expect(parse("/dex", hasUsagePage: nativeHasUsagePage) == .navigate(target: .dex))
    #expect(
      parse("/dex garchomp", hasUsagePage: nativeHasUsagePage) == .navigate(target: .dex)
    )
  }

  // MARK: SLASH-AC-1.4 — /usage gated on hasUsagePage

  @Test
  func navigatesUsageOnlyWhenTheClientHasAUsagePage() {
    #expect(
      parse("/usage", hasUsagePage: webHasUsagePage) == .navigate(target: .usage)
    )
    #expect(
      parse("/usage ou", hasUsagePage: webHasUsagePage) == .navigate(target: .usage)
    )
  }

  @Test
  func treatsUsageAsANormalMessageWhenHasUsagePageIsFalse() {
    #expect(parse("/usage", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/usage ou", hasUsagePage: nativeHasUsagePage) == .message)
  }

  // MARK: CALC-US-3 / CALC-AC-3.1–3.4 / CALC-BR-4 — /calc is handled

  @Test
  func treatsBareCalcAsHandledCalcWithEmptyRest() {
    #expect(parse("/calc", hasUsagePage: webHasUsagePage) == .calc(rest: ""))
    #expect(parse("/calc", hasUsagePage: nativeHasUsagePage) == .calc(rest: ""))
  }

  @Test
  func treatsCalcWithArgsAsHandledCalcCarryingTrimmedRest() {
    #expect(
      parse("/calc garchomp earthquake vs farigiraf", hasUsagePage: webHasUsagePage)
        == .calc(rest: "garchomp earthquake vs farigiraf")
    )
    #expect(
      parse("/calc garchomp earthquake vs farigiraf", hasUsagePage: nativeHasUsagePage)
        == .calc(rest: "garchomp earthquake vs farigiraf")
    )
    #expect(
      parse("/calc garchomp earthquake vs gholdengo", hasUsagePage: nativeHasUsagePage)
        == .calc(rest: "garchomp earthquake vs gholdengo")
    )
  }

  @Test
  func trimsWhitespaceAroundCalcRest() {
    #expect(
      parse("  /calc   garchomp earthquake vs farigiraf  ", hasUsagePage: nativeHasUsagePage)
        == .calc(rest: "garchomp earthquake vs farigiraf")
    )
    #expect(parse("/calc   ", hasUsagePage: nativeHasUsagePage) == .calc(rest: ""))
    #expect(
      parse("/calc\tgarchomp earthquake", hasUsagePage: nativeHasUsagePage)
        == .calc(rest: "garchomp earthquake")
    )
  }

  @Test
  func treatsHandledCalcAsNotAChatTurn() {
    let result = parse("/calc garchomp earthquake vs farigiraf", hasUsagePage: nativeHasUsagePage)
    #expect(result == .calc(rest: "garchomp earthquake vs farigiraf"))
    if case .message = result {
      Issue.record("handled /calc must not be a message turn (CALC-BR-4)")
    }
    if case .navigate = result {
      Issue.record("handled /calc must not navigate (CALC-AC-3.4)")
    }
    let labels = Mirror(reflecting: result).children.compactMap(\.label)
    #expect(!labels.contains("post"))
  }

  // MARK: SLASH-AC-1.5 / SLASH-BR-1 — unknown slashes are messages

  @Test
  func treatsUnknownSlashesIncludingCompareAsMessages() {
    #expect(parse("/compare", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/compare garchomp dragonite", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/foo", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/teams", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/newish", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/calcish", hasUsagePage: webHasUsagePage) == .message)

    #expect(parse("/compare", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/usage", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/newish", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/calcish", hasUsagePage: nativeHasUsagePage) == .message)
  }

  // MARK: SLASH-AC-1.6 — leading token only

  @Test
  func treatsAMidSentenceSlashAsANormalMessage() {
    #expect(parse("please open /new", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("what about /team later", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("see /dex garchomp", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("check /usage", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("please open /calc", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("please open /new", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("run /calc garchomp later", hasUsagePage: nativeHasUsagePage) == .message)
  }

  @Test
  func treatsTextWithoutALeadingSlashAsAMessage() {
    #expect(parse("new", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("team Rain Offense", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("   ", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("new", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("", hasUsagePage: nativeHasUsagePage) == .message)
  }

  @Test
  func usesTheFirstWhitespaceDelimitedTokenIncludingAfterLeadingSpace() {
    #expect(parse("  /new", hasUsagePage: webHasUsagePage) == .navigate(target: .new))
    #expect(
      parse("\t/dex garchomp", hasUsagePage: webHasUsagePage) == .navigate(target: .dex)
    )
    #expect(parse("/new\tmore", hasUsagePage: webHasUsagePage) == .navigate(target: .new))
    #expect(parse("  /new", hasUsagePage: nativeHasUsagePage) == .navigate(target: .new))
    #expect(
      parse("\t/dex garchomp", hasUsagePage: nativeHasUsagePage) == .navigate(target: .dex)
    )
  }

  // MARK: SLASH-BR-2 — classify only

  @Test
  func classifiesOnlyAHandledSlashIsNotAChatTurn() {
    let result = parse("/new", hasUsagePage: nativeHasUsagePage)
    #expect(result == .navigate(target: .new))
    if case .message = result {
      Issue.record("handled /new must not be a message turn")
    }
    let labels = Mirror(reflecting: result).children.compactMap(\.label)
    #expect(!labels.contains("post"))
    #expect(!labels.contains("message"))
  }
}
