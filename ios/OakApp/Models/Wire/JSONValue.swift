import Foundation

/// A fully recursive JSON value — `object | array | string | number | bool | null`.
///
/// Unlike `JSONScalar` (leaf scalars only, for the `submit_answer` heterogeneous
/// maps), `JSONValue` also carries nested objects/arrays, so it can round-trip an
/// arbitrary JSON-Schema `parameters` blob or a tool's structured `output`
/// verbatim — both of which are shapes this client never fully knows ahead of
/// time (they come from the server's tool layer, not a fixed Zod contract).
///
/// `number` collapses to `Double` (unlike `JSONScalar`'s `.int`/`.double` split):
/// there is no whole-number-vs-fractional distinction to preserve here, since
/// these values are never rendered directly — only decoded, inspected, and
/// re-serialized as JSON text for the wire.
enum JSONValue: Codable, Sendable, Equatable {
  case object([String: JSONValue])
  case array([JSONValue])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
      return
    }
    // Bool before Double (same ordering rationale as JSONScalar): JSON
    // true/false must not be coerced into 1/0 by a permissive Double decode.
    if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Value is not valid JSON (object, array, string, number, bool, or null)."
      )
    }
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .object(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .bool(let value): try container.encode(value)
    case .null: try container.encodeNil()
    }
  }
}

extension JSONValue {
  /// Serialize to a compact JSON string, e.g. for stringifying a tool's
  /// `output` before it rides back as a realtime `function_call_output`.
  /// Falls back to `"null"` on the (practically unreachable) encode failure.
  func serialized() -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(self), let text = String(data: data, encoding: .utf8) else {
      return "null"
    }
    return text
  }
}
