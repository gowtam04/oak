import Foundation

/// Leading-token slash parse on send (SLASH-US-1 / ADR-10).
///
/// Classifies only — it does not POST `/api/chat`. Known tokens (case-insensitive
/// exact match): `/new`, `/team`, `/dex`, `/calc`, `/help`, and `/usage` only when
/// `hasUsagePage` is true. After trim, text `=== "/"` is `.bare`. `/calc` rest is
/// the substring after the token, trimmed. `/compare` stays an ordinary message
/// (CMP-BR-3). iOS Usage is a fifth tab (ADR-6), so chat passes `hasUsagePage:
/// true` and `/usage` navigates.
enum SlashCommands {
  /// Leading-token parse. First whitespace-delimited token after leading
  /// whitespace wins. Exact token match only (`/newish` / `/calcish` are messages),
  /// compared case-insensitively.
  static func parse(_ text: String, hasUsagePage: Bool = false) -> SlashCommand {
    if text.trimmingCharacters(in: .whitespacesAndNewlines) == "/" {
      return .bare
    }

    let command = firstToken(text).lowercased()
    if command == "/new" { return .navigate(target: .new) }
    if command == "/team" { return .navigate(target: .team) }
    if command == "/dex" { return .navigate(target: .dex) }
    if command == "/help" { return .help }
    if command == "/calc" { return .calc(rest: slashArg(text)) }
    if command == "/usage", hasUsagePage { return .navigate(target: .usage) }
    return .message
  }

  /// Remainder after the first `\S+` token, trimmed. Empty string if none.
  static func slashArg(_ text: String) -> String {
    let trimmed = trimStart(text)
    let token = firstToken(trimmed)
    if token.isEmpty { return "" }
    return String(trimmed.dropFirst(token.count))
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Text after the leading token (trimmed), used by the client to route
  /// `/team {name}` / `/dex {name}`. `nil` when the send is just the command.
  static func argument(_ text: String) -> String? {
    let rest = slashArg(text)
    return rest.isEmpty ? nil : rest
  }

  private static func firstToken(_ text: String) -> String {
    let trimmed = trimStart(text)
    if trimmed.isEmpty { return "" }
    if let match = trimmed.range(of: #"^\S+"#, options: .regularExpression) {
      return String(trimmed[match])
    }
    return ""
  }

  private static func trimStart(_ text: String) -> String {
    String(text.drop(while: \.isWhitespace))
  }
}

/// Result of ``SlashCommands/parse(_:hasUsagePage:)``.
enum SlashCommand: Equatable, Sendable {
  case navigate(target: Target)
  case calc(rest: String)
  case help
  case bare
  case message

  enum Target: Equatable, Sendable {
    case new
    case team
    case dex
    case usage
  }
}
