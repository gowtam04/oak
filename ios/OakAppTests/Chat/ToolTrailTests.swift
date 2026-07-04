import Testing

@testable import OakApp

/// Pins the client-side tool-trail label + symbol mapping (fable-ui-strategy-ios.md
/// §4.03): the server sends web-oriented labels that may carry leading emoji, and the
/// iOS field-notes trail strips them, maps tool identity → SF Symbol, and renders the
/// instrument-voice row text. These are pure functions, so — unlike the SwiftUI view
/// body they back — they can be asserted directly.
struct ToolTrailTests {

  // MARK: Symbol mapping

  @Test
  func reasoningMapsToBrain() {
    #expect(ToolTrail.symbol(for: "reasoning") == "brain")
  }

  @Test
  func lookupToolsMapToMagnifyingGlass() {
    #expect(ToolTrail.symbol(for: "get_pokemon") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "get_move") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "resolve_entity") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "query_pokedex") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "list_teams") == "magnifyingglass")
  }

  @Test
  func specialToolsGetTheirOwnGlyph() {
    #expect(ToolTrail.symbol(for: "run_sql") == "tablecells")
    #expect(ToolTrail.symbol(for: "search_wiki") == "text.book.closed")
    #expect(ToolTrail.symbol(for: "get_usage_stats") == "chart.bar")
  }

  @Test
  func unknownToolFallsBackToWrench() {
    #expect(ToolTrail.symbol(for: "totally_new_tool") == "wrench.and.screwdriver")
  }

  // MARK: Emoji stripping

  @Test
  func stripsLeadingEmojiAndWhitespace() {
    #expect(ToolTrail.strippingLeadingEmoji("📇 Looking up Garchomp…") == "Looking up Garchomp…")
    #expect(ToolTrail.strippingLeadingEmoji("🤔 Reasoning…") == "Reasoning…")
    #expect(ToolTrail.strippingLeadingEmoji("🛡️ Checking Fire/Flying matchups…") == "Checking Fire/Flying matchups…")
  }

  @Test
  func leavesEmojiFreeLabelUntouched() {
    #expect(ToolTrail.strippingLeadingEmoji("Composing the answer") == "Composing the answer")
  }

  @Test
  func stripsOnlyLeadingEmojiNotInterior() {
    // An interior symbol (rare) must survive — only the leading run is removed.
    let out = ToolTrail.strippingLeadingEmoji("📖 Searching the wiki")
    #expect(out == "Searching the wiki")
  }

  // MARK: Row label — tool · subject

  @Test
  func parsesQuotedSubjectIntoToolAndSubject() {
    // resolve_entity's label carries a curly-quoted query.
    #expect(
      ToolTrail.rowLabel(tool: "resolve_entity", label: "🔍 Resolving “Garchomp”…")
        == "resolve_entity · Garchomp"
    )
  }

  @Test
  func parsesTrailingCapitalisedSubject() {
    #expect(
      ToolTrail.rowLabel(tool: "get_pokemon", label: "📇 Looking up Garchomp…")
        == "get_pokemon · Garchomp"
    )
  }

  @Test
  func fallsBackToCleanedLabelWhenNoSubject() {
    // "Reasoning…" has no distinct subject — fall back to the cleaned label.
    #expect(ToolTrail.rowLabel(tool: "reasoning", label: "🤔 Reasoning…") == "Reasoning…")
  }

  @Test
  func fallsBackToToolWhenLabelEmpty() {
    #expect(ToolTrail.rowLabel(tool: "run_sql", label: "") == "run_sql")
  }

  // MARK: Summary chip

  @Test
  func summaryLabelPluralises() {
    #expect(ToolTrail.summaryLabel(count: 1, seconds: 3) == "1 lookup · 3s")
    #expect(ToolTrail.summaryLabel(count: 4, seconds: 6) == "4 lookups · 6s")
  }

  @Test
  func summaryLabelDropsSecondsWhenAbsent() {
    #expect(ToolTrail.summaryLabel(count: 2, seconds: nil) == "2 lookups")
  }

  @Test
  func summaryAccessibilityLabelIsSpoken() {
    #expect(ToolTrail.summaryAccessibilityLabel(count: 1, seconds: 3) == "1 lookup in 3 seconds")
    #expect(ToolTrail.summaryAccessibilityLabel(count: 4, seconds: 6) == "4 lookups in 6 seconds")
    #expect(ToolTrail.summaryAccessibilityLabel(count: 2, seconds: nil) == "2 lookups")
  }
}
