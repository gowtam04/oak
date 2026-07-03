import Foundation

/// A single block-level element parsed out of a Markdown document.
///
/// The inline content each case carries (`text`, table cells, list-item text,
/// blockquote body) is still raw Markdown — bold/italic/`code`/links inside a
/// block are interpreted later by the SwiftUI renderer's inline `MarkdownText`
/// pass. Only the *block* structure (headings, lists, GFM tables, fences,
/// blockquotes, thematic breaks) is resolved here.
///
/// This type and ``MarkdownBlocks`` are deliberately SwiftUI-free so the grammar
/// can be unit-tested in isolation (`MarkdownBlocksTests`). The renderer lives in
/// `MarkdownBlockView`.
enum MarkdownBlock: Equatable, Sendable {
  /// An ATX heading. `level` is clamped to `1...4` (deeper `#####`/`######`
  /// collapse to 4, matching the plan's "deeper levels clamp to smallest style").
  case heading(level: Int, text: String)
  /// A run of prose. May contain hard line breaks (`\n`) the renderer preserves.
  case paragraph(String)
  /// An ordered or unordered list; items carry their own marker + one nesting level.
  case list([MarkdownListItem])
  /// A GFM pipe table (header row + `---` separator + zero-or-more body rows).
  case table(MarkdownTable)
  /// A fenced code block (``` … ``` or ~~~ … ~~~). `language` is the info string.
  case codeBlock(language: String?, code: String)
  /// A `>`-prefixed blockquote; the body keeps its inner line breaks.
  case blockquote(String)
  /// A thematic break (`---`, `***`, `___`).
  case thematicBreak
}

/// One list item: its marker kind + ordinal, its (clamped) nesting level, and the
/// inline Markdown text after the marker.
struct MarkdownListItem: Equatable, Sendable {
  /// `true` for `1.`/`2)` ordered markers, `false` for `-`/`*`/`+` bullets.
  var ordered: Bool
  /// The parsed ordinal for an ordered item (`1` for unordered — unused there).
  var number: Int
  /// `0` for a top-level item, `1` for a nested one. Deeper indentation clamps to 1.
  var level: Int
  /// The inline Markdown following the marker (continuation lines are folded in).
  var text: String
}

/// Column text alignment parsed from a GFM separator row (`:---`, `---:`, `:--:`).
enum MarkdownColumnAlignment: Equatable, Sendable {
  case leading, center, trailing
}

/// A parsed GFM table. `alignments` and every `rows` entry are normalized to
/// `header.count` columns (ragged rows are padded/truncated), so the renderer can
/// lay out a fixed grid without bounds-checking.
struct MarkdownTable: Equatable, Sendable {
  var header: [String]
  var alignments: [MarkdownColumnAlignment]
  var rows: [[String]]
}

/// Block-level Markdown splitter — a single-pass, line-based grammar tuned for
/// Oak's answer/reasoning prose (a few KB of GFM). It is **streaming-safe**: an
/// unclosed trailing block (half a table, an open code fence) never drops content
/// and never throws — it falls back to a plain paragraph until the block completes.
enum MarkdownBlocks {

  /// Splits `source` into ordered block elements. Never throws; unrecognized or
  /// half-formed input becomes paragraph blocks so no content is lost.
  static func parse(_ source: String) -> [MarkdownBlock] {
    let normalized = source
      .replacingOccurrences(of: "\r\n", with: "\n")
      .replacingOccurrences(of: "\r", with: "\n")
    let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

    var blocks: [MarkdownBlock] = []
    var paragraph: [String] = []

    func flushParagraph() {
      let joined = paragraph.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
      if !joined.isEmpty { blocks.append(.paragraph(joined)) }
      paragraph.removeAll(keepingCapacity: true)
    }

    var i = 0
    while i < lines.count {
      let line = lines[i]
      let trimmed = line.trimmingCharacters(in: .whitespaces)

      // Blank line — a block boundary.
      if trimmed.isEmpty {
        flushParagraph()
        i += 1
        continue
      }

      // Fenced code block. An unclosed fence (mid-stream) degrades to a paragraph.
      if let fence = fenceInfo(trimmed) {
        flushParagraph()
        var codeLines: [String] = []
        var j = i + 1
        var closed = false
        while j < lines.count {
          let cand = lines[j].trimmingCharacters(in: .whitespaces)
          if isClosingFence(cand, fence.char) {
            closed = true
            break
          }
          codeLines.append(lines[j])
          j += 1
        }
        if closed {
          blocks.append(.codeBlock(language: fence.language, code: codeLines.joined(separator: "\n")))
          i = j + 1
        } else {
          // Streaming-safe fallback: keep the opener + partial body verbatim.
          let raw = ([line] + codeLines).joined(separator: "\n")
          blocks.append(.paragraph(raw))
          i = lines.count
        }
        continue
      }

      // ATX heading.
      if let heading = parseHeading(trimmed) {
        flushParagraph()
        blocks.append(heading)
        i += 1
        continue
      }

      // GFM table — this line looks like a row AND the next is a separator row.
      if line.contains("|"),
         i + 1 < lines.count,
         let alignments = parseSeparatorRow(lines[i + 1]) {
        flushParagraph()
        let header = splitTableRow(line)
        var rows: [[String]] = []
        var j = i + 2
        while j < lines.count {
          let rowLine = lines[j]
          let rowTrimmed = rowLine.trimmingCharacters(in: .whitespaces)
          if rowTrimmed.isEmpty || !rowLine.contains("|") { break }
          // A heading/fence starting mid-table ends the table.
          if parseHeading(rowTrimmed) != nil || fenceInfo(rowTrimmed) != nil { break }
          rows.append(normalize(splitTableRow(rowLine), to: header.count))
          j += 1
        }
        blocks.append(.table(MarkdownTable(
          header: header,
          alignments: normalizeAlignments(alignments, to: header.count),
          rows: rows
        )))
        i = j
        continue
      }

      // Thematic break.
      if isThematicBreak(trimmed) {
        flushParagraph()
        blocks.append(.thematicBreak)
        i += 1
        continue
      }

      // Blockquote.
      if trimmed.hasPrefix(">") {
        flushParagraph()
        var quoteLines: [String] = []
        var j = i
        while j < lines.count {
          let q = lines[j].trimmingCharacters(in: .whitespaces)
          guard q.hasPrefix(">") else { break }
          var content = String(q.dropFirst())
          if content.hasPrefix(" ") { content.removeFirst() }
          quoteLines.append(content)
          j += 1
        }
        let body = quoteLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        blocks.append(.blockquote(body))
        i = j
        continue
      }

      // List (ordered or unordered), one nesting level.
      if listItem(from: line) != nil {
        flushParagraph()
        var items: [MarkdownListItem] = []
        var j = i
        while j < lines.count {
          let l = lines[j]
          if l.trimmingCharacters(in: .whitespaces).isEmpty { break }
          if let item = listItem(from: l) {
            items.append(item)
            j += 1
          } else if l.first == " " || l.first == "\t" {
            // A wrapped continuation line — fold it into the current item.
            if !items.isEmpty {
              items[items.count - 1].text += " " + l.trimmingCharacters(in: .whitespaces)
            }
            j += 1
          } else {
            break
          }
        }
        blocks.append(.list(items))
        i = j
        continue
      }

      // Default: accumulate into the current paragraph.
      paragraph.append(line)
      i += 1
    }

    flushParagraph()
    return blocks
  }

  // MARK: - Fences

  /// Parses a fence opener from a trimmed line, returning the fence character and
  /// the info string (language) if present. Nil when the line is not a fence.
  private static func fenceInfo(_ trimmed: String) -> (char: Character, language: String?)? {
    guard let first = trimmed.first, first == "`" || first == "~" else { return nil }
    var count = 0
    var idx = trimmed.startIndex
    while idx < trimmed.endIndex, trimmed[idx] == first {
      count += 1
      idx = trimmed.index(after: idx)
    }
    guard count >= 3 else { return nil }
    let rest = trimmed[idx...].trimmingCharacters(in: .whitespaces)
    return (first, rest.isEmpty ? nil : rest)
  }

  /// A closing fence is a trimmed line of three-or-more of the opener's fence char
  /// and nothing else (so `` ```swift `` never closes a `` ``` `` block).
  private static func isClosingFence(_ trimmed: String, _ char: Character) -> Bool {
    guard trimmed.count >= 3, trimmed.first == char else { return false }
    return trimmed.allSatisfy { $0 == char }
  }

  // MARK: - Headings

  private static func parseHeading(_ trimmed: String) -> MarkdownBlock? {
    guard trimmed.first == "#" else { return nil }
    var level = 0
    var idx = trimmed.startIndex
    while idx < trimmed.endIndex, trimmed[idx] == "#" {
      level += 1
      idx = trimmed.index(after: idx)
    }
    guard (1...6).contains(level) else { return nil }
    // ATX requires a space after the run (or end of line for an empty heading).
    guard idx == trimmed.endIndex || trimmed[idx] == " " else { return nil }
    var text = trimmed[idx...].trimmingCharacters(in: .whitespaces)
    text = stripTrailingHashes(text)
    return .heading(level: min(level, 4), text: text)
  }

  /// Drops an optional ATX closing `#` sequence (`## Title ##` → `Title`).
  private static func stripTrailingHashes(_ text: String) -> String {
    var t = Substring(text)
    while t.last == "#" { t = t.dropLast() }
    return t.trimmingCharacters(in: .whitespaces)
  }

  // MARK: - Tables

  /// Splits one pipe-delimited row into trimmed cells, dropping the optional
  /// leading/trailing border pipes while keeping interior empty cells.
  private static func splitTableRow(_ line: String) -> [String] {
    var s = Substring(line.trimmingCharacters(in: .whitespaces))
    if s.hasPrefix("|") { s = s.dropFirst() }
    if s.hasSuffix("|") { s = s.dropLast() }
    return s.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
  }

  /// Parses a GFM separator row into per-column alignments, or nil if the line is
  /// not a valid separator (every non-empty cell must be `:?-+:?`).
  private static func parseSeparatorRow(_ line: String) -> [MarkdownColumnAlignment]? {
    guard line.contains("|") || line.contains("-") else { return nil }
    let cells = splitTableRow(line)
    guard !cells.isEmpty else { return nil }
    var alignments: [MarkdownColumnAlignment] = []
    for cell in cells {
      guard !cell.isEmpty else { return nil }
      let left = cell.hasPrefix(":")
      let right = cell.hasSuffix(":")
      var body = Substring(cell)
      if left { body = body.dropFirst() }
      if right { body = body.dropLast() }
      guard !body.isEmpty, body.allSatisfy({ $0 == "-" }) else { return nil }
      alignments.append(left && right ? .center : right ? .trailing : .leading)
    }
    return alignments
  }

  private static func normalize(_ row: [String], to count: Int) -> [String] {
    if row.count == count { return row }
    if row.count > count { return Array(row.prefix(count)) }
    return row + Array(repeating: "", count: count - row.count)
  }

  private static func normalizeAlignments(
    _ alignments: [MarkdownColumnAlignment], to count: Int
  ) -> [MarkdownColumnAlignment] {
    if alignments.count == count { return alignments }
    if alignments.count > count { return Array(alignments.prefix(count)) }
    return alignments + Array(repeating: .leading, count: count - alignments.count)
  }

  // MARK: - Thematic break

  private static func isThematicBreak(_ trimmed: String) -> Bool {
    let dense = trimmed.filter { $0 != " " }
    guard dense.count >= 3 else { return false }
    return dense.allSatisfy { $0 == "-" }
      || dense.allSatisfy { $0 == "*" }
      || dense.allSatisfy { $0 == "_" }
  }

  // MARK: - List items

  /// Parses a single list-item line into a ``MarkdownListItem``, or nil if the line
  /// is not a list item. Leading indentation of two-or-more columns marks a nested
  /// (level 1) item; deeper nesting clamps to 1. `-`/`*`/`+` are bullets; `1.`/`2)`
  /// are ordered. A bare `-`/`*` with no following text (e.g. `---`) is not a list.
  private static func listItem(from line: String) -> MarkdownListItem? {
    var indent = 0
    var idx = line.startIndex
    while idx < line.endIndex, line[idx] == " " || line[idx] == "\t" {
      indent += line[idx] == "\t" ? 4 : 1
      idx = line.index(after: idx)
    }
    guard idx < line.endIndex else { return nil }
    let level = indent >= 2 ? 1 : 0
    let ch = line[idx]

    if ch == "-" || ch == "*" || ch == "+" {
      let after = line.index(after: idx)
      guard after < line.endIndex, line[after] == " " else { return nil }
      let text = line[line.index(after: after)...].trimmingCharacters(in: .whitespaces)
      guard !text.isEmpty else { return nil }
      return MarkdownListItem(ordered: false, number: 1, level: level, text: text)
    }

    if ch.isNumber {
      var end = idx
      var digits = ""
      while end < line.endIndex, line[end].isNumber {
        digits.append(line[end])
        end = line.index(after: end)
      }
      guard end < line.endIndex, line[end] == "." || line[end] == ")" else { return nil }
      let after = line.index(after: end)
      guard after < line.endIndex, line[after] == " " else { return nil }
      let text = line[line.index(after: after)...].trimmingCharacters(in: .whitespaces)
      guard !text.isEmpty else { return nil }
      return MarkdownListItem(ordered: true, number: Int(digits) ?? 1, level: level, text: text)
    }

    return nil
  }
}
