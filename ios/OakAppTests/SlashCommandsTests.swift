import Foundation
import Testing

@testable import OakApp

/// Slash-discovery P3 lockstep oracle — leading-token slash parse on send.
///
/// Clones `web/src/lib/chat/slash-commands.test.ts`. The parser only
/// classifies; it does not POST `/api/chat`.
///
/// Expected API (web `parseSlashCommand` / `slashArg`):
///   `SlashCommands.parse(_ text: String, hasUsagePage: Bool) -> SlashCommand`
///   `SlashCommand.navigate(target:)` | `.calc(rest:)` | `.help` | `.bare` | `.message`
///   `SlashCommand.Target` = `new` | `team` | `dex` | `usage`
///   `SlashCommands.slashArg(_ text: String) -> String`
///     remainder after the first token, trimmed; `""` if none (web `slashArg`).
///
/// `/calc` is a handled slash (CALC-AC-3.4 / ADR-4). `rest` is the substring
/// after `/calc`, trimmed. Empty rest → open overlay, current scope. `/compare`
/// stays a normal message (CMP-BR-3). After trim, text `=== "/"` is `.bare`
/// (SD-AC-7.1) — not a message. `/help` (extra words ignored) is `.help`
/// (SD-AC-4.3, SD-BR-18).
///
/// Fails to compile until `SlashCommand` grows `.help` / `.bare` and
/// `SlashCommands.slashArg` exists (`ios/OakApp/Features/Chat/SlashCommands.swift`).
///
/// iOS Usage is a fifth tab (ADR-6) — callers pass `hasUsagePage: true`.
/// `/usage` navigates. No palette / shortcuts (NAV-US-1/2 are web-only).
///
/// Known leading tokens (case-insensitive exact match): `/new`, `/team`,
/// `/dex`, `/calc`, `/help`, and `/usage` only when `hasUsagePage == true`.
/// First whitespace-delimited token wins. Extra words stay off the
/// navigate/help result (clients read them via `slashArg`). Unknown slashes
/// (`/foo`, `/newish`) — and `/usage` when the client has no usage page —
/// are ordinary messages.
///
/// Requirement refs: SD-BR-1, SD-BR-4, SD-AC-4.3, SD-AC-7.1; also Chat QoL
/// SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2, CALC-US-3, CALC-AC-3.1–3.4,
/// CALC-BR-4. Chat QoL ADR-10; slash-discovery ADR-1 (client classifier).
struct SlashCommandsTests {

  /// Web lockstep option — usage page exists.
  private let webHasUsagePage = true
  /// iOS Usage is a fifth tab (ADR-6).
  private let nativeHasUsagePage = true

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
    #expect(
      parse("/usage", hasUsagePage: nativeHasUsagePage) == .navigate(target: .usage)
    )
    #expect(
      parse("/usage garchomp", hasUsagePage: nativeHasUsagePage) == .navigate(target: .usage)
    )
  }

  @Test
  func treatsUsageAsANormalMessageWhenHasUsagePageIsFalse() {
    #expect(parse("/usage", hasUsagePage: false) == .message)
    #expect(parse("/usage ou", hasUsagePage: false) == .message)
    #expect(parse("/USAGE", hasUsagePage: false) == .message)
  }

  // MARK: CALC-US-3 / CALC-AC-3.1–3.4 / CALC-BR-4 — /calc is handled

  @Test
  func treatsBareCalcAsHandledCalcWithEmptyRest() {
    #expect(parse("/calc", hasUsagePage: webHasUsagePage) == .calc(rest: ""))
    #expect(parse("/calc", hasUsagePage: nativeHasUsagePage) == .calc(rest: ""))
    #expect(parse("  /calc", hasUsagePage: webHasUsagePage) == .calc(rest: ""))
    #expect(parse("/calc   ", hasUsagePage: webHasUsagePage) == .calc(rest: ""))
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
    #expect(
      parse("/calc foo vs bar", hasUsagePage: webHasUsagePage) == .calc(rest: "foo vs bar")
    )
    #expect(
      parse("\t/calc   foo vs bar", hasUsagePage: false) == .calc(rest: "foo vs bar")
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

  @Test
  func doesNotTreatCalcishOrAMidSentenceCalcAsHandled() {
    #expect(parse("/calcish", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("please /calc", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("open /calc garchomp", hasUsagePage: webHasUsagePage) == .message)
  }

  // MARK: SLASH-AC-1.5 / SLASH-BR-1 / SD-BR-1 — unknown slashes are messages

  @Test
  func treatsUnknownSlashesIncludingCompareAsMessages() {
    #expect(parse("/compare", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/compare garchomp dragonite", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/foo", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/teams", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/", hasUsagePage: webHasUsagePage) == .bare)
    #expect(parse("/newish", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/calcish", hasUsagePage: webHasUsagePage) == .message)

    #expect(parse("/compare", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/newish", hasUsagePage: nativeHasUsagePage) == .message)
    #expect(parse("/calcish", hasUsagePage: nativeHasUsagePage) == .message)
  }

  @Test
  func treatsNewishAsAMessageTokenIsNotExactlyNew() {
    #expect(parse("/newish", hasUsagePage: webHasUsagePage) == .message)
    #expect(parse("/NEWISH", hasUsagePage: webHasUsagePage) == .message)
  }

  // MARK: SD-AC-4.3 / SD-BR-18 — /help

  @Test
  func classifiesHelpAsHelpExtraWordsIgnored() {
    #expect(parse("/help", hasUsagePage: webHasUsagePage) == .help)
    #expect(parse("/help", hasUsagePage: false) == .help)
    #expect(parse("/help extra words", hasUsagePage: webHasUsagePage) == .help)
    #expect(parse("  /help extra  ", hasUsagePage: webHasUsagePage) == .help)
  }

  // MARK: SD-AC-7.1 — bare /

  @Test
  func classifiesAComposerThatTrimsToExactlySlashAsBare() {
    #expect(parse("/", hasUsagePage: webHasUsagePage) == .bare)
    #expect(parse("/", hasUsagePage: false) == .bare)
    #expect(parse(" / ", hasUsagePage: webHasUsagePage) == .bare)
    #expect(parse("  /  ", hasUsagePage: webHasUsagePage) == .bare)
    #expect(parse("\t/\t", hasUsagePage: webHasUsagePage) == .bare)
  }

  // MARK: SD-BR-4 — case-insensitive tokens

  @Test
  func matchesCommandTokensCaseInsensitively() {
    #expect(parse("/DEX", hasUsagePage: webHasUsagePage) == .navigate(target: .dex))
    #expect(parse("/Dex", hasUsagePage: webHasUsagePage) == .navigate(target: .dex))
    #expect(parse("/HELP", hasUsagePage: webHasUsagePage) == .help)
    #expect(parse("/USAGE", hasUsagePage: webHasUsagePage) == .navigate(target: .usage))
    #expect(parse("/NEW", hasUsagePage: webHasUsagePage) == .navigate(target: .new))
    #expect(parse("/TEAM Rain", hasUsagePage: webHasUsagePage) == .navigate(target: .team))
    #expect(parse("/CALC foo vs bar", hasUsagePage: webHasUsagePage) == .calc(rest: "foo vs bar"))
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

  // MARK: SLASH-BR-2 / SD-AC-4.3 / SD-AC-7.1 — classify only

  @Test
  func classifiesOnlyAHandledSlashIsNotAChatTurn() {
    let nav = parse("/new", hasUsagePage: nativeHasUsagePage)
    #expect(nav == .navigate(target: .new))
    if case .message = nav {
      Issue.record("handled /new must not be a message turn")
    }
    let navLabels = Mirror(reflecting: nav).children.compactMap(\.label)
    #expect(!navLabels.contains("post"))
    #expect(!navLabels.contains("message"))

    let calc = parse("/calc foo vs bar", hasUsagePage: webHasUsagePage)
    #expect(calc == .calc(rest: "foo vs bar"))
    let calcLabels = Mirror(reflecting: calc).children.compactMap(\.label)
    #expect(!calcLabels.contains("post"))
    if case .message = calc {
      Issue.record("handled /calc must not be a message turn")
    }

    let help = parse("/help extra words", hasUsagePage: webHasUsagePage)
    #expect(help == .help)
    let helpLabels = Mirror(reflecting: help).children.compactMap(\.label)
    #expect(!helpLabels.contains("post"))
    #expect(!helpLabels.contains("message"))

    let bare = parse("/", hasUsagePage: webHasUsagePage)
    #expect(bare == .bare)
    let bareLabels = Mirror(reflecting: bare).children.compactMap(\.label)
    #expect(!bareLabels.contains("post"))
    #expect(!bareLabels.contains("message"))
  }

  // MARK: SD-BR-1 — slashArg remainder

  @Test
  func slashArgReturnsTheTrimmedRemainderAfterTheFirstToken() {
    #expect(SlashCommands.slashArg("/dex Garchomp") == "Garchomp")
    #expect(SlashCommands.slashArg("/dex") == "")
    #expect(SlashCommands.slashArg("  /help extra ") == "extra")
    #expect(SlashCommands.slashArg("/calc foo vs bar") == "foo vs bar")
    #expect(SlashCommands.slashArg("/new rain team") == "rain team")
    #expect(SlashCommands.slashArg("\t/dex garchomp") == "garchomp")
    #expect(SlashCommands.slashArg("/") == "")
    #expect(SlashCommands.slashArg("") == "")
  }
}
