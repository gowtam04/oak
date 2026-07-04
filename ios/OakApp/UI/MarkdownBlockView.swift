import SwiftUI

/// Renders block-level Markdown — headings, lists, GFM tables, fenced code,
/// blockquotes, thematic breaks — natively, using ``MarkdownBlocks/parse(_:)`` to
/// split the source and the inline ``MarkdownText`` primitive to render the
/// bold/italic/`code`/link markup *inside* each block. This is the block-aware
/// counterpart to ``MarkdownText`` (which stays inline-only); use it wherever an
/// `OakAnswer` field can carry block structure — `answer_markdown`,
/// `reasoning_markdown`, and the live streaming bubble.
///
/// **Streaming-safe by construction:** the splitter degrades a half-formed trailing
/// block (an open code fence, a header without its separator) to a plain
/// inline-parsed paragraph, so re-rendering on every delta never drops content and
/// never flickers structure it can't yet resolve.
///
/// Typography/color inherit from the environment for prose (paragraphs, list items,
/// table cells) so a caller's `.font(…)`/`.foregroundStyle(…)` and Dynamic Type
/// flow through; only headings, code, and table chrome set their own type/wash.
struct MarkdownBlockView: View {
  private let markdown: String
  private let precomputedBlocks: [MarkdownBlock]?

  /// Text-like, unlabeled initializer mirroring ``MarkdownText``.
  init(_ markdown: String) {
    self.markdown = markdown
    self.precomputedBlocks = nil
  }

  /// Renders a pre-parsed block slice. Used by ``AnswerCardView`` to render
  /// the blocks after the lead paragraph without re-parsing the full source.
  init(blocks: [MarkdownBlock]) {
    self.markdown = ""
    self.precomputedBlocks = blocks
  }

  var body: some View {
    let blocks = precomputedBlocks ?? MarkdownBlocks.parse(markdown)
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        view(for: block)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  @ViewBuilder
  private func view(for block: MarkdownBlock) -> some View {
    switch block {
    case let .heading(level, text):
      MarkdownText(text)
        .font(headingFont(level))
        .fixedSize(horizontal: false, vertical: true)
    case let .paragraph(text):
      MarkdownText(text)
        .fixedSize(horizontal: false, vertical: true)
    case let .list(items):
      MarkdownListView(items: items)
    case let .table(table):
      MarkdownTableView(table: table)
    case let .codeBlock(_, code):
      MarkdownCodeBlockView(code: code)
    case let .blockquote(text):
      MarkdownBlockquoteView(text: text)
    case .thematicBreak:
      Divider().overlay(Theme.separator)
    }
  }

  /// Heading type ramp, scaled to chat-card sizing (h1 is a section title, not a
  /// hero). `display(_:)` is rounded + semibold — Oak's heading voice. Color is
  /// left to inherit so a heading inside muted reasoning text stays muted.
  private func headingFont(_ level: Int) -> Font {
    switch level {
    case 1: return Theme.display(.title3)
    case 2: return Theme.display(.headline)
    case 3: return Theme.display(.subheadline)
    default: return Theme.display(.footnote)
    }
  }
}

// MARK: - Lists

/// An ordered/unordered list with a single supported nesting level. Bullets use a
/// mid-dot; ordered items keep their parsed ordinal. Nested (level-1) items indent.
private struct MarkdownListView: View {
  let items: [MarkdownListItem]

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(items.enumerated()), id: \.offset) { _, item in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(marker(item))
            .monospacedDigit()
            .foregroundStyle(Theme.textSecondary)
          MarkdownText(item.text)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, CGFloat(item.level) * 18)
      }
    }
  }

  private func marker(_ item: MarkdownListItem) -> String {
    item.ordered ? "\(item.number)." : (item.level == 0 ? "•" : "◦")
  }
}

// MARK: - Table

/// A GFM table rendered as a native, horizontally-scrollable grid, matching the
/// `CandidatesTableView` conventions (header wash, full-width hairline, zebra rows,
/// trailing scroll fade). Cells are inline-parsed so bold/`code`/links inside a
/// cell still render.
private struct MarkdownTableView: View {
  let table: MarkdownTable

  var body: some View {
    ScrollView(.horizontal, showsIndicators: true) {
      Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
        GridRow {
          ForEach(Array(table.header.enumerated()), id: \.offset) { index, heading in
            cell(background: headerBackground, alignment: alignment(index)) {
              MarkdownText(heading)
                .font(Theme.body(.caption).weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
        GridRow {
          Rectangle()
            .fill(Theme.separator)
            .frame(height: 1)
            .gridCellUnsizedAxes(.horizontal)
            .gridCellColumns(max(table.header.count, 1))
        }
        ForEach(Array(table.rows.enumerated()), id: \.offset) { rowIndex, row in
          GridRow {
            ForEach(Array(row.enumerated()), id: \.offset) { colIndex, value in
              cell(background: rowBackground(rowIndex), alignment: alignment(colIndex)) {
                MarkdownText(value)
                  .font(Theme.body(.subheadline))
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
      }
    }
    .background(Theme.surface)
    .oakCard(radius: Theme.Radius.md)
    .overlay(alignment: .trailing) { scrollFade }
  }

  private func alignment(_ column: Int) -> Alignment {
    guard column < table.alignments.count else { return .leading }
    switch table.alignments[column] {
    case .leading: return .leading
    case .center: return .center
    case .trailing: return .trailing
    }
  }

  private var scrollFade: some View {
    LinearGradient(
      colors: [Theme.surface.opacity(0), Theme.surface],
      startPoint: .leading,
      endPoint: .trailing
    )
    .frame(width: 24)
    .allowsHitTesting(false)
  }

  private var headerBackground: Color { Theme.textPrimary.opacity(0.06) }

  private func rowBackground(_ index: Int) -> Color {
    index.isMultiple(of: 2) ? Color.clear : Theme.textPrimary.opacity(0.04)
  }

  @ViewBuilder
  private func cell<Content: View>(
    background: Color,
    alignment: Alignment,
    @ViewBuilder content: () -> Content
  ) -> some View {
    content()
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: alignment)
      .background(background)
  }
}

// MARK: - Code block

/// A fenced code block: monospaced, on a raised surface, horizontally scrollable so
/// long lines never force the page to scroll sideways. No syntax highlighting.
private struct MarkdownCodeBlockView: View {
  let code: String

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(code)
        .font(Theme.mono(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .textSelection(.enabled)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Theme.surface)
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
        .strokeBorder(Theme.separator, lineWidth: 1)
    )
  }
}

// MARK: - Blockquote

/// A blockquote: an accent rule on the leading edge with muted, inline-parsed body
/// text.
private struct MarkdownBlockquoteView: View {
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      RoundedRectangle(cornerRadius: 2, style: .continuous)
        .fill(Theme.accent.opacity(0.5))
        .frame(width: 3)
      MarkdownText(text)
        .foregroundStyle(Theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}

#if DEBUG
#Preview("MarkdownBlockView — mixed document") {
  ScrollView {
    MarkdownBlockView(
      """
      ## Best moveset for Garchomp

      Garchomp wants a **physical** set. Key moves:

      - Dragon Claw — reliable STAB
      - Earthquake — coverage
        - hits Steel/Rock hard
      1. Lead with it
      2. Pivot out

      | Move | Type | BP |
      | --- | --- | ---: |
      | Dragon Claw | Dragon | 80 |
      | Earthquake | Ground | 100 |

      > Speed tiers matter — `108` base outpaces most walls.

      ```
      252 Atk Garchomp Earthquake
      ```

      ---

      See [Bulbapedia](https://bulbapedia.bulbagarden.net) for details.
      """
    )
    .font(Theme.body(.body))
    .foregroundStyle(Theme.textPrimary)
    .padding()
  }
}
#endif
