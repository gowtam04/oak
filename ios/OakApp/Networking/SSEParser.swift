import Foundation

/// A pure, incremental Server-Sent-Events line parser: it is fed `event:`/`data:`
/// field lines one at a time and emits typed events on each blank-line-terminated
/// frame. The byte→line splitting (``ByteLineSplitter``) and the stream loop
/// (``SSEClient``) are shared across event families; this seam is what lets a
/// SIBLING parser (e.g. the team-builder's ``BuilderSSEParser``, whose terminal
/// `answer` carries a `BuilderAnswer` not an `OakAnswer`) reuse all of that plumbing
/// while decoding its own event union.
///
/// `Sendable` so the shared stream loop can create one inside its `@Sendable` task.
protocol SSELineParser: Sendable {
  /// The event type this parser decodes each frame into.
  associatedtype Event: Sendable

  /// Feeds one line. Returns the events completed by this line (zero or one for a
  /// well-formed stream — a blank line that closes a frame).
  mutating func consume(line: String) throws -> [Event]

  /// Flushes any buffered frame at end-of-stream (a defensive backstop; well-formed
  /// streams end with a blank line, so the buffer is already empty).
  mutating func finish() throws -> [Event]
}

/// A pure, incremental Server-Sent-Events frame parser (component-design.md
/// "Networking layer"). It accumulates `event:`/`data:` field lines, emits one
/// ``SSEEvent`` per blank-line-terminated frame, and ignores `:`-prefixed comment
/// lines (the `: keep-alive` heartbeats sent every 15s).
///
/// **No I/O** — the caller feeds it lines (e.g. from `URLSession.AsyncBytes.lines`,
/// which already strips newlines) one at a time; the parser owns only the in-flight
/// frame state. This keeps it trivially unit-testable against recorded `.sse`
/// fixtures.
///
/// Decoding policy:
///   * A recognized event whose `data:` JSON fails to decode throws
///     `OakError.decoding(...)` (a contract drift the consumer surfaces) — this is
///     the only thing that makes the stream fail from inside the parser.
///   * An **unknown** event name is ignored (forward-compatible with new events).
///   * Comment lines, unknown fields (`id`/`retry`), and empty/incomplete frames
///     (e.g. a trailing blank line) emit nothing.
struct SSEParser: SSELineParser {
  private var eventName: String?
  private var dataBuffer = ""
  private var hasData = false

  init() {}

  /// Feeds one line. Returns the events completed by this line (zero or one for a
  /// well-formed stream — a blank line that closes a frame).
  mutating func consume(line rawLine: String) throws -> [SSEEvent] {
    // Robustness against CRLF input even though `.lines` normalizes newlines.
    var line = rawLine
    if line.hasSuffix("\r") {
      line.removeLast()
    }

    if line.isEmpty {
      return try dispatch()
    }
    if line.hasPrefix(":") {
      return []  // comment / heartbeat
    }

    let (field, value) = Self.splitField(line)
    switch field {
    case "event":
      eventName = value
    case "data":
      if hasData {
        dataBuffer.append("\n")
      }
      dataBuffer.append(value)
      hasData = true
    default:
      break  // id / retry / unknown field → ignored per SSE spec
    }
    return []
  }

  /// Flushes any buffered frame at end-of-stream. Well-formed streams end with a
  /// blank line so the buffer is already empty; this is a defensive backstop.
  mutating func finish() throws -> [SSEEvent] {
    try dispatch()
  }

  // MARK: - Internals

  /// Closes the in-flight frame, decodes it into an ``SSEEvent``, and resets state.
  private mutating func dispatch() throws -> [SSEEvent] {
    let name = eventName
    let payload = dataBuffer
    let complete = hasData
    reset()

    guard let name, complete else {
      return []  // empty/incomplete frame (e.g. a trailing blank line)
    }

    let json = Data(payload.utf8)
    let decoder = JSONDecoder()
    do {
      switch name {
      case "turn":
        let data = try decoder.decode(SSEEvent.TurnData.self, from: json)
        return [.turn(turnId: data.turnId)]
      case "scope":
        let data = try decoder.decode(SSEEvent.ScopeData.self, from: json)
        return [.scope(format: data.format, source: data.source)]
      case "tool_activity":
        let data = try decoder.decode(SSEEvent.ToolActivityData.self, from: json)
        return [.toolActivity(tool: data.tool, label: data.label)]
      case "answer_start":
        return [.answerStart]
      case "answer_delta":
        let data = try decoder.decode(SSEEvent.AnswerDeltaData.self, from: json)
        return [.answerDelta(text: data.text)]
      case "answer":
        let data = try decoder.decode(SSEEvent.AnswerData.self, from: json)
        return [.answer(data.answer)]
      case "error":
        let data = try decoder.decode(SSEEvent.ErrorData.self, from: json)
        return [.error(code: data.code, message: data.message, status: data.status)]
      case "stopped":
        return [.stopped]  // terminal; `data: {}` carries no payload
      default:
        return []  // unknown event name → forward-compatible no-op
      }
    } catch {
      throw OakError.decoding("SSEEvent.\(name)")
    }
  }

  /// Resets the in-flight frame state.
  private mutating func reset() {
    eventName = nil
    dataBuffer = ""
    hasData = false
  }

  /// Splits a `field: value` SSE line, stripping a single optional leading space
  /// from the value (per the SSE spec). A line with no colon is a field with an
  /// empty value.
  private static func splitField(_ line: String) -> (field: String, value: String) {
    guard let colon = line.firstIndex(of: ":") else {
      return (line, "")
    }
    let field = String(line[line.startIndex..<colon])
    var valueStart = line.index(after: colon)
    if valueStart < line.endIndex, line[valueStart] == " " {
      valueStart = line.index(after: valueStart)
    }
    return (field, String(line[valueStart..<line.endIndex]))
  }
}
