import Foundation

/// A pure, incremental SSE frame parser for the team-builder assistant stream — a
/// SIBLING of ``SSEParser`` over the identical `event:`/`data:` framing, decoding the
/// builder event union instead of the chat one. The two differences that matter:
///   * the terminal `answer` frame carries a ``BuilderAnswer`` (prose + optional
///     ``TeamPatch``), NOT an `OakAnswer`;
///   * there is no `scope` event (`draft.format` is the turn's scope), so a stray
///     `scope` frame — like any unknown event — is ignored (forward-compatible).
///
/// Feeds off the SAME ``ByteLineSplitter`` + ``SSEClient/openEventStream(_:makeParser:)``
/// plumbing the chat stream uses (it conforms to ``SSELineParser``), so no byte-level
/// parsing is duplicated. Decoding policy matches ``SSEParser``: a recognized event
/// whose `data:` JSON fails to decode throws `OakError.decoding(...)`; unknown event
/// names, comments, and incomplete frames emit nothing.
struct BuilderSSEParser: SSELineParser {
  private var eventName: String?
  private var dataBuffer = ""
  private var hasData = false

  init() {}

  mutating func consume(line rawLine: String) throws -> [BuilderSSEEvent] {
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

  mutating func finish() throws -> [BuilderSSEEvent] {
    try dispatch()
  }

  // MARK: - Internals

  /// Closes the in-flight frame, decodes it into a ``BuilderSSEEvent``, and resets state.
  private mutating func dispatch() throws -> [BuilderSSEEvent] {
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
      case "tool_activity":
        let data = try decoder.decode(BuilderSSEEvent.ToolActivityData.self, from: json)
        return [.toolActivity(tool: data.tool, label: data.label)]
      case "answer_start":
        return [.answerStart]
      case "answer_delta":
        let data = try decoder.decode(BuilderSSEEvent.AnswerDeltaData.self, from: json)
        return [.answerDelta(text: data.text)]
      case "answer":
        let data = try decoder.decode(BuilderSSEEvent.AnswerData.self, from: json)
        return [.answer(data.answer)]
      case "error":
        let data = try decoder.decode(BuilderSSEEvent.ErrorData.self, from: json)
        return [.error(code: data.code, message: data.message, status: data.status)]
      default:
        return []  // unknown event name (incl. chat-only `scope`) → forward-compatible
      }
    } catch {
      throw OakError.decoding("BuilderSSEEvent.\(name)")
    }
  }

  private mutating func reset() {
    eventName = nil
    dataBuffer = ""
    hasData = false
  }

  /// Splits a `field: value` SSE line, stripping a single optional leading space from
  /// the value (per the SSE spec). A line with no colon is a field with an empty value.
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
