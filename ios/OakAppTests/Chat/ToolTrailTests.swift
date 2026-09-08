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

  // MARK: Action-label mapping — a raw tool id must never render

  @Test
  func friendlyNounCoversEveryDocumentedTool() {
    #expect(ToolTrail.friendlyNoun("resolve_entity") == "Identifying")
    #expect(ToolTrail.friendlyNoun("query_pokedex") == "Searching Pokédex")
    #expect(ToolTrail.friendlyNoun("get_pokemon") == "Looking up Pokémon")
    #expect(ToolTrail.friendlyNoun("get_move") == "Looking up move")
    #expect(ToolTrail.friendlyNoun("get_ability") == "Reading ability")
    #expect(ToolTrail.friendlyNoun("get_item") == "Looking up item")
    #expect(ToolTrail.friendlyNoun("get_type_matchups") == "Checking matchups")
    #expect(ToolTrail.friendlyNoun("type_matchup") == "Checking matchups")
    #expect(ToolTrail.friendlyNoun("get_type_chart") == "Checking matchups")
    #expect(ToolTrail.friendlyNoun("get_evolution_chain") == "Tracing evolution")
    #expect(ToolTrail.friendlyNoun("compute_stat") == "Computing stats")
    #expect(ToolTrail.friendlyNoun("estimate_damage") == "Calculating damage")
    #expect(ToolTrail.friendlyNoun("get_usage_stats") == "Checking live usage")
    #expect(ToolTrail.friendlyNoun("get_meta_usage") == "Checking ladder usage")
    #expect(ToolTrail.friendlyNoun("get_encounters") == "Finding locations")
    #expect(ToolTrail.friendlyNoun("get_learnset") == "Checking learnset")
    #expect(ToolTrail.friendlyNoun("lookup_box") == "Looking up box")
    #expect(ToolTrail.friendlyNoun("get_team") == "Reading team")
    #expect(ToolTrail.friendlyNoun("list_teams") == "Listing teams")
    #expect(ToolTrail.friendlyNoun("save_team") == "Saving team")
    #expect(ToolTrail.friendlyNoun("run_sql") == "Querying game data")
    #expect(ToolTrail.friendlyNoun("search_wiki") == "Searching wiki")
    #expect(ToolTrail.friendlyNoun("submit_answer") == "Answer")
    #expect(ToolTrail.friendlyNoun("submit_builder_answer") == "Teams")
  }

  @Test
  func friendlyNounFallsBackToLookingUpForUnknownTools() {
    #expect(ToolTrail.friendlyNoun("totally_new_tool") == "Looking up")
  }

  // MARK: Row label — noun · subject

  @Test
  func parsesQuotedSubjectIntoToolAndSubject() {
    // resolve_entity's label carries a curly-quoted query.
    #expect(
      ToolTrail.rowLabel(tool: "resolve_entity", label: "🔍 Resolving “Garchomp”…")
        == "Identifying · Garchomp"
    )
  }

  @Test
  func parsesTrailingCapitalisedSubject() {
    #expect(
      ToolTrail.rowLabel(tool: "get_pokemon", label: "📇 Looking up Garchomp…")
        == "Looking up Pokémon · Garchomp"
    )
  }

  @Test
  func parsesMultiWordCapitalisedSubject() {
    #expect(ToolTrail.subject(from: "Looking up Fake Out") == "Fake Out")
    #expect(ToolTrail.subject(from: "Looking up Armor Tail") == "Armor Tail")
    #expect(
      ToolTrail.subject(from: "Looking up the move Will-O-Wisp") == "Will-O-Wisp"
    )
  }

  @Test
  func stripsVerbAndTrailingPossessiveFromLearnsetLabels() {
    #expect(ToolTrail.subject(from: "Checking Torkoal's learnset…") == "Torkoal")
    #expect(ToolTrail.subject(from: "Checking Torkoal’s learnset…") == "Torkoal")
    #expect(
      ToolTrail.subject(from: "Checking Charizard-Mega-Y’s learnset…")
        == "Charizard-Mega-Y"
    )
  }

  @Test
  func takesTheClauseAfterAColon() {
    #expect(ToolTrail.subject(from: "Searching the Pokédex: Fire…") == "Fire")
    #expect(
      ToolTrail.subject(from: "Searching the Pokédex: Fire · Speed > 100…")
        == "Fire · Speed > 100"
    )
  }

  @Test
  func prefersTheSpeciesOverALaterFormatWord() {
    #expect(
      ToolTrail.subject(from: "Checking Torkoal’s live Doubles usage…")
        == "Torkoal"
    )
  }

  @Test
  func readsAbilityEvolutionAndMatchupLabels() {
    #expect(ToolTrail.subject(from: "Reading the Drought ability…") == "Drought")
    #expect(ToolTrail.subject(from: "Tracing Garchomp’s evolution…") == "Garchomp")
    #expect(
      ToolTrail.subject(from: "Checking Fire/Flying matchups…") == "Fire/Flying"
    )
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
    #expect(ToolTrail.rowLabel(tool: "run_sql", label: "") == "Querying game data")
  }

  @Test
  func fallsBackToFriendlyNounForUnknownToolWithEmptyLabel() {
    #expect(ToolTrail.rowLabel(tool: "totally_new_tool", label: "") == "Looking up")
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
    #expect(sentence == "Looking up Looking up move, Looking up Pokémon")
    #expect(!sentence.contains("get_move"))
    #expect(!sentence.contains("get_pokemon"))
  }

  // MARK: Incoming-plate status copy (verb + rest)

  @Test
  func orbStateMatchesCrossPlatformTable() {
    #expect(ThinkingTraceCopy.orbState(reconnecting: true, latestTool: "get_pokemon") == .connecting)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: nil) == .breathing)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "get_pokemon") == .searching)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "search_wiki") == .searching)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "lookup_box") == .searching)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "compute_stat") == .solving)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "run_sql") == .solving)
    #expect(ThinkingTraceCopy.orbState(reconnecting: false, latestTool: "submit_answer") == .breathing)
    #expect(
      ThinkingTraceCopy.orbState(
        reconnecting: false, latestTool: "get_pokemon", writing: true
      ) == .composing
    )
    #expect(
      ThinkingTraceCopy.orbState(
        reconnecting: true, latestTool: "get_pokemon", writing: true
      ) == .connecting
    )
  }

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
    #expect(rows[0].primary == "Identifying")
    #expect(rows[0].secondary == "Farigiraf")
    #expect(rows[0].active == false)
    #expect(rows[1].primary == "Looking up move")
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
