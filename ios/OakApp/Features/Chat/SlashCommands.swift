import Foundation

/// Leading-token slash parse on send (SLASH-US-1 / ADR-10).
///
/// Classifies only — it does not POST `/api/chat`. Known tokens: `/new`, `/team`,
/// `/dex`, and `/usage` only when `hasUsagePage` is true. iOS has no usage page,
/// so callers pass `hasUsagePage: false` and `/usage` is a normal message.
enum SlashCommands {
  /// Leading-token parse. First whitespace-delimited token after leading
  /// whitespace wins. Exact token match only (`/newish` is a message).
  static func parse(_ text: String, hasUsagePage: Bool = false) -> SlashCommand {
    let token = firstToken(text)
    if token == "/new" { return .navigate(target: .new) }
    if token == "/team" { return .navigate(target: .team) }
    if token == "/dex" { return .navigate(target: .dex) }
    if token == "/usage", hasUsagePage { return .navigate(target: .usage) }
    return .message
  }

  /// Text after the leading token (trimmed), used by the client to route
  /// `/team {name}` / `/dex {name}`. Empty when the send is just the command.
  static func argument(_ text: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let match = trimmed.range(of: #"^\S+\s+"#, options: .regularExpression) else {
      return nil
    }
    let rest = trimmed[match.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
    return rest.isEmpty ? nil : rest
  }

  private static func firstToken(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return "" }
    if let match = trimmed.range(of: #"^\S+"#, options: .regularExpression) {
      return String(trimmed[match])
    }
    return ""
  }
}

/// Result of ``SlashCommands/parse(_:hasUsagePage:)``.
enum SlashCommand: Equatable, Sendable {
  case navigate(target: Target)
  case message

  enum Target: Equatable, Sendable {
    case new
    case team
    case dex
    case usage
  }
}
