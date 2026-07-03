import Testing

@testable import OakApp

/// Unit tests for the pure block-level Markdown splitter (``MarkdownBlocks``). The
/// SwiftUI renderer (`MarkdownBlockView`) is intentionally out of scope here — the
/// grammar is what's fragile (especially under streaming), so it's tested in
/// isolation with no view dependency.
struct MarkdownBlocksTests {

  // MARK: - Paragraphs

  @Test
  func emptyStringYieldsNoBlocks() {
    #expect(MarkdownBlocks.parse("").isEmpty)
    #expect(MarkdownBlocks.parse("   \n\n  ").isEmpty)
  }

  @Test
  func plainProsePassesThroughAsOneParagraph() {
    #expect(MarkdownBlocks.parse("Just a sentence.") == [.paragraph("Just a sentence.")])
  }

  @Test
  func softLineBreaksStayInsideOneParagraph() {
    #expect(
      MarkdownBlocks.parse("line one\nline two")
        == [.paragraph("line one\nline two")]
    )
  }

  @Test
  func blankLineSplitsParagraphs() {
    #expect(
      MarkdownBlocks.parse("first\n\nsecond")
        == [.paragraph("first"), .paragraph("second")]
    )
  }

  @Test
  func inlineMarkupIsLeftForTheInlinePass() {
    // The splitter must NOT interpret bold/`code`/links — it hands the raw span on.
    #expect(
      MarkdownBlocks.parse("**Garchomp** has `108` base Speed")
        == [.paragraph("**Garchomp** has `108` base Speed")]
    )
  }

  // MARK: - Headings

  @Test
  func atxHeadingLevels() {
    #expect(MarkdownBlocks.parse("# H1") == [.heading(level: 1, text: "H1")])
    #expect(MarkdownBlocks.parse("## H2") == [.heading(level: 2, text: "H2")])
    #expect(MarkdownBlocks.parse("### H3") == [.heading(level: 3, text: "H3")])
    #expect(MarkdownBlocks.parse("#### H4") == [.heading(level: 4, text: "H4")])
  }

  @Test
  func deeperHeadingsClampToFour() {
    #expect(MarkdownBlocks.parse("##### H5") == [.heading(level: 4, text: "H5")])
    #expect(MarkdownBlocks.parse("###### H6") == [.heading(level: 4, text: "H6")])
  }

  @Test
  func sevenHashesIsNotAHeading() {
    #expect(MarkdownBlocks.parse("####### nope") == [.paragraph("####### nope")])
  }

  @Test
  func hashWithoutSpaceIsNotAHeading() {
    #expect(MarkdownBlocks.parse("#hashtag") == [.paragraph("#hashtag")])
  }

  @Test
  func trailingHashesAreStripped() {
    #expect(MarkdownBlocks.parse("## Title ##") == [.heading(level: 2, text: "Title")])
  }

  // MARK: - Lists

  @Test
  func unorderedList() {
    let blocks = MarkdownBlocks.parse("- one\n- two\n- three")
    #expect(blocks == [.list([
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "one"),
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "two"),
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "three"),
    ])])
  }

  @Test
  func unorderedListAcceptsStarAndPlus() {
    #expect(
      MarkdownBlocks.parse("* star\n+ plus")
        == [.list([
          MarkdownListItem(ordered: false, number: 1, level: 0, text: "star"),
          MarkdownListItem(ordered: false, number: 1, level: 0, text: "plus"),
        ])]
    )
  }

  @Test
  func orderedListKeepsOrdinals() {
    let blocks = MarkdownBlocks.parse("1. first\n2. second\n3) third")
    #expect(blocks == [.list([
      MarkdownListItem(ordered: true, number: 1, level: 0, text: "first"),
      MarkdownListItem(ordered: true, number: 2, level: 0, text: "second"),
      MarkdownListItem(ordered: true, number: 3, level: 0, text: "third"),
    ])])
  }

  @Test
  func nestedListGetsLevelOne() {
    let blocks = MarkdownBlocks.parse("- top\n  - nested\n- back")
    #expect(blocks == [.list([
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "top"),
      MarkdownListItem(ordered: false, number: 1, level: 1, text: "nested"),
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "back"),
    ])])
  }

  @Test
  func deepNestingClampsToLevelOne() {
    let blocks = MarkdownBlocks.parse("- a\n      - very deep")
    #expect(blocks == [.list([
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "a"),
      MarkdownListItem(ordered: false, number: 1, level: 1, text: "very deep"),
    ])])
  }

  @Test
  func continuationLineFoldsIntoItem() {
    let blocks = MarkdownBlocks.parse("- start of item\n  wrapped tail\n- next")
    #expect(blocks == [.list([
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "start of item wrapped tail"),
      MarkdownListItem(ordered: false, number: 1, level: 0, text: "next"),
    ])])
  }

  @Test
  func blankLineInterruptsList() {
    let blocks = MarkdownBlocks.parse("- one\n\nafter")
    #expect(blocks == [
      .list([MarkdownListItem(ordered: false, number: 1, level: 0, text: "one")]),
      .paragraph("after"),
    ])
  }

  @Test
  func paragraphThenListSplitsCleanly() {
    let blocks = MarkdownBlocks.parse("Here are options:\n- a\n- b")
    #expect(blocks == [
      .paragraph("Here are options:"),
      .list([
        MarkdownListItem(ordered: false, number: 1, level: 0, text: "a"),
        MarkdownListItem(ordered: false, number: 1, level: 0, text: "b"),
      ]),
    ])
  }

  // MARK: - Tables

  @Test
  func wellFormedTable() {
    let source = """
      | Move | Type | BP |
      | --- | --- | --- |
      | Dragon Claw | Dragon | 80 |
      | Earthquake | Ground | 100 |
      """
    #expect(MarkdownBlocks.parse(source) == [.table(MarkdownTable(
      header: ["Move", "Type", "BP"],
      alignments: [.leading, .leading, .leading],
      rows: [
        ["Dragon Claw", "Dragon", "80"],
        ["Earthquake", "Ground", "100"],
      ]
    ))])
  }

  @Test
  func tableAlignmentsFromSeparator() {
    let source = """
      | L | C | R |
      | :--- | :---: | ---: |
      | 1 | 2 | 3 |
      """
    guard case let .table(table) = MarkdownBlocks.parse(source).first else {
      Issue.record("expected a table")
      return
    }
    #expect(table.alignments == [.leading, .center, .trailing])
  }

  @Test
  func tableWithoutBorderPipes() {
    let source = """
      a | b
      --- | ---
      1 | 2
      """
    #expect(MarkdownBlocks.parse(source) == [.table(MarkdownTable(
      header: ["a", "b"],
      alignments: [.leading, .leading],
      rows: [["1", "2"]]
    ))])
  }

  @Test
  func raggedRowsArePaddedAndTruncated() {
    let source = """
      | a | b | c |
      | --- | --- | --- |
      | 1 | 2 |
      | 1 | 2 | 3 | 4 |
      """
    guard case let .table(table) = MarkdownBlocks.parse(source).first else {
      Issue.record("expected a table")
      return
    }
    #expect(table.rows == [
      ["1", "2", ""],
      ["1", "2", "3"],
    ])
  }

  @Test
  func headerWithoutSeparatorIsNotATable() {
    // Mid-stream: only the header has arrived. It must render as prose, not a table.
    #expect(
      MarkdownBlocks.parse("| Move | Type |")
        == [.paragraph("| Move | Type |")]
    )
  }

  @Test
  func tableWithHeaderAndSeparatorButNoRows() {
    // Valid mid-stream state: header + separator, body still to come.
    let source = """
      | Move | Type |
      | --- | --- |
      """
    #expect(MarkdownBlocks.parse(source) == [.table(MarkdownTable(
      header: ["Move", "Type"],
      alignments: [.leading, .leading],
      rows: []
    ))])
  }

  @Test
  func tableEndsAtBlankLine() {
    let source = """
      | a | b |
      | --- | --- |
      | 1 | 2 |

      trailing prose
      """
    let blocks = MarkdownBlocks.parse(source)
    #expect(blocks.count == 2)
    #expect(blocks.last == .paragraph("trailing prose"))
  }

  // MARK: - Fenced code

  @Test
  func closedFenceWithLanguage() {
    let source = """
      ```swift
      let x = 1
      let y = 2
      ```
      """
    #expect(
      MarkdownBlocks.parse(source)
        == [.codeBlock(language: "swift", code: "let x = 1\nlet y = 2")]
    )
  }

  @Test
  func tildeFence() {
    let source = """
      ~~~
      raw
      ~~~
      """
    #expect(MarkdownBlocks.parse(source) == [.codeBlock(language: nil, code: "raw")])
  }

  @Test
  func fencePreservesMarkdownCharactersVerbatim() {
    let source = """
      ```
      # not a heading
      - not a list
      | not | a table |
      ```
      """
    #expect(
      MarkdownBlocks.parse(source)
        == [.codeBlock(language: nil, code: "# not a heading\n- not a list\n| not | a table |")]
    )
  }

  @Test
  func unclosedFenceDegradesToParagraph() {
    // Streaming: the closing fence hasn't arrived. Content must survive, not drop.
    let source = "```swift\nlet x = 1"
    #expect(MarkdownBlocks.parse(source) == [.paragraph("```swift\nlet x = 1")])
  }

  // MARK: - Blockquotes & thematic breaks

  @Test
  func blockquoteStripsMarker() {
    #expect(
      MarkdownBlocks.parse("> quoted line\n> second line")
        == [.blockquote("quoted line\nsecond line")]
    )
  }

  @Test
  func thematicBreakVariants() {
    #expect(MarkdownBlocks.parse("---") == [.thematicBreak])
    #expect(MarkdownBlocks.parse("***") == [.thematicBreak])
    #expect(MarkdownBlocks.parse("___") == [.thematicBreak])
    #expect(MarkdownBlocks.parse("- - -") == [.thematicBreak])
  }

  @Test
  func dashListItemIsNotAThematicBreak() {
    #expect(
      MarkdownBlocks.parse("- item")
        == [.list([MarkdownListItem(ordered: false, number: 1, level: 0, text: "item")])]
    )
  }

  // MARK: - Mixed / realistic

  @Test
  func realisticOakAnswerMixesBlocks() {
    let source = """
      ## Garchomp's best moveset

      Garchomp wants a **physical** attacker set.

      Recommended moves:

      - Dragon Claw
      - Earthquake

      | Move | Type | BP |
      | --- | --- | ---: |
      | Dragon Claw | Dragon | 80 |
      | Earthquake | Ground | 100 |

      Source: [Bulbapedia](https://bulbapedia.bulbagarden.net)
      """
    let blocks = MarkdownBlocks.parse(source)
    #expect(blocks.count == 6)
    #expect(blocks[0] == .heading(level: 2, text: "Garchomp's best moveset"))
    #expect(blocks[1] == .paragraph("Garchomp wants a **physical** attacker set."))
    #expect(blocks[2] == .paragraph("Recommended moves:"))
    guard case .list = blocks[3] else {
      Issue.record("blocks[3] should be a list")
      return
    }
    guard case .table = blocks[4] else {
      Issue.record("blocks[4] should be a table")
      return
    }
    #expect(blocks[5] == .paragraph("Source: [Bulbapedia](https://bulbapedia.bulbagarden.net)"))
  }

  @Test
  func streamingPrefixesNeverDropContent() {
    // Simulate answer text arriving delta-by-delta: every prefix must parse without
    // throwing and must preserve the visible text (no lost characters).
    let full = """
      ## Title

      - a
      - b

      | x | y |
      | --- | --- |
      | 1 | 2 |
      """
    for length in 1...full.count {
      let prefix = String(full.prefix(length))
      let blocks = MarkdownBlocks.parse(prefix)
      // Reconstruct the visible characters (order-preserving) and confirm the
      // prefix's non-whitespace content is fully represented somewhere in the parse.
      let rendered = blocks.map(renderedText).joined()
      let stripped = { (s: String) in s.filter { !$0.isWhitespace && $0 != "#" && $0 != "|" && $0 != "-" } }
      // Every alphanumeric from the prefix survives into some block.
      for ch in stripped(prefix) {
        #expect(rendered.contains(ch))
      }
    }
  }

  /// Flattens a block back to its visible text, for the streaming-safety assertion.
  private func renderedText(_ block: MarkdownBlock) -> String {
    switch block {
    case let .heading(_, text): return text
    case let .paragraph(text): return text
    case let .blockquote(text): return text
    case .thematicBreak: return ""
    case let .codeBlock(_, code): return code
    case let .list(items): return items.map(\.text).joined(separator: " ")
    case let .table(table):
      return (table.header + table.rows.flatMap { $0 }).joined(separator: " ")
    }
  }
}
