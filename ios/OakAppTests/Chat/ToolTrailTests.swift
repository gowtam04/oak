import Testing

@testable import OakApp

/// Pins the client-side tool-trail label + symbol mapping (specimen desk field notes /
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
  func perToolGlyphsAreDistinct() {
    // The restored per-tool map: each data domain keeps its own glyph.
    #expect(ToolTrail.symbol(for: "get_pokemon") == "book")
    #expect(ToolTrail.symbol(for: "get_move") == "bolt")
    #expect(ToolTrail.symbol(for: "get_ability") == "sparkles")
    #expect(ToolTrail.symbol(for: "get_item") == "bag")
    #expect(ToolTrail.symbol(for: "type_matchup") == "shield.lefthalf.filled")
    #expect(ToolTrail.symbol(for: "get_type_chart") == "shield.lefthalf.filled")
    #expect(ToolTrail.symbol(for: "compute_stat") == "chart.bar")
    #expect(ToolTrail.symbol(for: "estimate_damage") == "function")
    #expect(ToolTrail.symbol(for: "get_learnset") == "list.bullet")
    #expect(ToolTrail.symbol(for: "get_team") == "person.3")
    #expect(ToolTrail.symbol(for: "save_team") == "person.3")
    #expect(ToolTrail.symbol(for: "list_teams") == "person.3")
    #expect(ToolTrail.symbol(for: "get_encounters") == "map")
  }

  @Test
  func specialToolsGetTheirOwnGlyph() {
    #expect(ToolTrail.symbol(for: "run_sql") == "tablecells")
    #expect(ToolTrail.symbol(for: "search_wiki") == "text.book.closed")
    #expect(ToolTrail.symbol(for: "get_usage_stats") == "chart.bar")
  }

  @Test
  func prefixFallbacksCoverUnmatchedLookups() {
    // list_* → list glyph; other unmatched lookups → magnifying glass.
    #expect(ToolTrail.symbol(for: "resolve_entity") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "query_pokedex") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "get_evolution_chain") == "magnifyingglass")
    #expect(ToolTrail.symbol(for: "list_formats") == "list.bullet")
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

  // MARK: Friendly noun mapping (copy-tables.md §1) — a raw tool id must never render

  @Test
  func friendlyNounCoversEveryDocumentedTool() {
    #expect(ToolTrail.friendlyNoun("resolve_entity") == "Dex lookup")
    #expect(ToolTrail.friendlyNoun("query_pokedex") == "Pokédex search")
    #expect(ToolTrail.friendlyNoun("get_pokemon") == "Pokémon")
    #expect(ToolTrail.friendlyNoun("get_move") == "Move")
    #expect(ToolTrail.friendlyNoun("get_ability") == "Ability")
    #expect(ToolTrail.friendlyNoun("get_item") == "Item")
    #expect(ToolTrail.friendlyNoun("get_type_matchups") == "Type matchups")
    #expect(ToolTrail.friendlyNoun("get_evolution_chain") == "Evolution")
    #expect(ToolTrail.friendlyNoun("compute_stat") == "Stats")
    #expect(ToolTrail.friendlyNoun("estimate_damage") == "Damage calc")
    #expect(ToolTrail.friendlyNoun("get_usage_stats") == "Usage")
    #expect(ToolTrail.friendlyNoun("get_meta_usage") == "Usage")
    #expect(ToolTrail.friendlyNoun("get_encounters") == "Locations")
    #expect(ToolTrail.friendlyNoun("get_learnset") == "Movepool")
    #expect(ToolTrail.friendlyNoun("get_team") == "Teams")
    #expect(ToolTrail.friendlyNoun("list_teams") == "Teams")
    #expect(ToolTrail.friendlyNoun("save_team") == "Teams")
    #expect(ToolTrail.friendlyNoun("run_sql") == "Game data")
    #expect(ToolTrail.friendlyNoun("search_wiki") == "Wiki")
    #expect(ToolTrail.friendlyNoun("submit_answer") == "Answer")
    #expect(ToolTrail.friendlyNoun("submit_builder_answer") == "Teams")
  }

  @Test
  func friendlyNounFallsBackToLookupForUnknownTools() {
    #expect(ToolTrail.friendlyNoun("totally_new_tool") == "Lookup")
  }

  // MARK: Row label — noun · subject

  @Test
  func parsesQuotedSubjectIntoToolAndSubject() {
    // resolve_entity's label carries a curly-quoted query.
    #expect(
      ToolTrail.rowLabel(tool: "resolve_entity", label: "🔍 Resolving “Garchomp”…")
        == "Dex lookup · Garchomp"
    )
  }

  @Test
  func parsesTrailingCapitalisedSubject() {
    #expect(
      ToolTrail.rowLabel(tool: "get_pokemon", label: "📇 Looking up Garchomp…")
        == "Pokémon · Garchomp"
    )
  }

  @Test
  func parsesMultiWordCapitalisedSubject() {
    #expect(ToolTrail.subject(from: "Looking up Fake Out") == "Fake Out")
    #expect(ToolTrail.subject(from: "Looking up Armor Tail") == "Armor Tail")
  }

  @Test
  func fallsBackToCleanedLabelWhenNoSubject() {
    // "Reasoning…" has no distinct subject — fall back to the cleaned label.
    #expect(ToolTrail.rowLabel(tool: "reasoning", label: "🤔 Reasoning…") == "Reasoning…")
  }

  @Test
  func fallsBackToFriendlyNounWhenLabelEmpty() {
    // A raw tool id must never render — the empty-label path falls back to the
    // friendly noun, not the wire tool id.
    #expect(ToolTrail.rowLabel(tool: "run_sql", label: "") == "Game data")
  }

  @Test
  func fallsBackToFriendlyNounForUnknownToolWithEmptyLabel() {
    #expect(ToolTrail.rowLabel(tool: "totally_new_tool", label: "") == "Lookup")
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

  // MARK: Streaming sentence (friendly nouns, never raw tool ids)

  @Test
  func streamingSentenceUsesSubjectsNotToolIds() {
    #expect(
      ToolTrail.streamingSentence(activities: [
        (tool: "resolve_entity", label: "🔍 Resolving “Farigiraf”…"),
        (tool: "get_move", label: "Looking up Fake Out…"),
        (tool: "get_ability", label: "Looking up Armor Tail…"),
      ]) == "Looking up Farigiraf, Fake Out, Armor Tail"
    )
  }

  @Test
  func streamingSentenceFallsBackToLookingThingsUpWhenEmpty() {
    #expect(ToolTrail.streamingSentence(activities: []) == "Looking things up…")
    #expect(
      ToolTrail.streamingSentence(activities: [
        (tool: "reasoning", label: "🤔 Reasoning…")
      ]) == "Looking things up…"
    )
  }

  @Test
  func streamingSentenceNeverEmitsRawToolIds() {
    let sentence = ToolTrail.streamingSentence(activities: [
      (tool: "get_move", label: ""),
      (tool: "get_pokemon", label: ""),
    ])
    #expect(sentence == "Looking up Move, Pokémon")
    #expect(!sentence.contains("get_move"))
    #expect(!sentence.contains("get_pokemon"))
  }

  // MARK: Incoming-plate status copy (verb + rest)

  @Test
  func thinkingHeaderIsLiveUntilSettled() {
    #expect(
      ThinkingTraceCopy.header(reconnecting: false, settled: false, elapsedSeconds: 3)
        == .init(live: true, text: "Thinking")
    )
    #expect(
      ThinkingTraceCopy.header(reconnecting: false, settled: true, elapsedSeconds: 4)
        == .init(live: false, text: "Thought for 4 seconds")
    )
    #expect(ThinkingTraceCopy.thoughtFor(1) == "Thought for 1 second")
    #expect(ThinkingTraceCopy.thoughtFor(0) == "Thought for a moment")
    #expect(
      ThinkingTraceCopy.header(reconnecting: true, settled: false)
        == .init(live: true, text: "Reconnecting")
    )
  }

  @Test
  func thinkingRowsMapFriendlyNounsAndSubjects() {
    let rows = ThinkingTraceCopy.rows(
      activities: [
        (tool: "resolve_entity", label: "🔍 Resolving “Farigiraf”…"),
        (tool: "get_move", label: "Looking up Fake Out…"),
        (tool: "submit_answer", label: "✍️ Composing the answer…"),
      ],
      settled: false
    )
    #expect(rows.count == 2)
    #expect(rows[0].primary == "Dex lookup")
    #expect(rows[0].secondary == "Farigiraf")
    #expect(rows[0].active == false)
    #expect(rows[1].primary == "Move")
    #expect(rows[1].secondary == "Fake Out")
    #expect(rows[1].active == true)
    #expect(!rows.contains { $0.tool == "submit_answer" })
  }

  @Test
  func answeringAndReconnectCopy() {
    let writing = StreamingStatusCopy.parts(phase: .answering, activities: [], reconnecting: false)
    #expect(writing.verb == "Thought for a moment")
    let reconnect = StreamingStatusCopy.parts(
      phase: .thinking, activities: [], reconnecting: true
    )
    #expect(reconnect.verb == "Reconnecting")
    #expect(reconnect.rest == "")
  }
}
