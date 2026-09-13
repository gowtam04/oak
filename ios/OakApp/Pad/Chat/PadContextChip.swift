import Foundation

/// Workspace object attached to the next companion send (P-SHELL-US-3, ADR-P4).
/// Mapping is the sent user text (visible in the bubble) plus optional team ids
/// for ``ChatViewModel/extraMentionedTeamIds`` — no `context:` JSON.
enum PadContextChip: Equatable, Sendable {
  case team(id: String, name: String, liveShowdown: String)
  case pokemon(slug: String, name: String)
  case move(slug: String, name: String)
  case ability(slug: String, name: String)
  case item(slug: String, name: String)
  case usageSpecies(slug: String, name: String)
  /// Explain prompt already built (CalculatorViewModel.explainPrompt /
  /// pendingChatSend). Do not invent a new HTTP payload.
  case calc(explainPrompt: String)

  /// Display label for ``PadContextChipView`` (the open object's name).
  var displayName: String {
    switch self {
    case .team(_, let name, _),
      .pokemon(_, let name),
      .move(_, let name),
      .ability(_, let name),
      .item(_, let name),
      .usageSpecies(_, let name):
      name
    case .calc:
      "Calculator"
    }
  }

  func apply(to message: String) -> (text: String, mentionedTeamIds: [String]?) {
    switch self {
    case .team(let id, let name, let liveShowdown):
      let draft = liveShowdown.trimmingCharacters(in: .whitespacesAndNewlines)
      if draft.isEmpty {
        return (message, [id])
      }
      let text = message + "\n\nLive team draft (\(name)):\n```\n\(draft)\n```"
      return (text, [id])
    case .pokemon(_, let name),
      .move(_, let name),
      .ability(_, let name),
      .item(_, let name),
      .usageSpecies(_, let name):
      return ("Regarding \(name).\n\n\(message)", nil)
    case .calc(let explainPrompt):
      if message.isEmpty {
        return (explainPrompt, nil)
      }
      return (explainPrompt + "\n\n" + message, nil)
    }
  }
}

extension Optional where Wrapped == PadContextChip {
  func apply(to message: String) -> (text: String, mentionedTeamIds: [String]?) {
    switch self {
    case .none: (message, nil)
    case .some(let chip): chip.apply(to: message)
    }
  }
}
