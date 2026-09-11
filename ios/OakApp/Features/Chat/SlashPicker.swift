import Foundation

/// Composer `/` picker model (slash-discovery). Catalog, phase, prefix filter,
/// insert strings, Dex-row merge, and bind-still-valid. Pure — no I/O, no POST.
enum SlashPicker {
  static let commands: [SlashCommandRow] = [
    SlashCommandRow(token: "/new", hint: "New empty chat", trailingSpace: false, arg: .none),
    SlashCommandRow(
      token: "/team",
      hint: "Open Teams",
      hintGuest: "Open Teams · sign in to save",
      trailingSpace: true,
      arg: .team
    ),
    SlashCommandRow(token: "/dex", hint: "Open Dex", trailingSpace: true, arg: .dex),
    SlashCommandRow(token: "/usage", hint: "Open live usage", trailingSpace: true, arg: .usage),
    SlashCommandRow(token: "/calc", hint: "Open calculator", trailingSpace: true, arg: .calc),
    SlashCommandRow(token: "/help", hint: "Show these commands", trailingSpace: false, arg: .none),
  ]

  static let pickerCaption = "Insert, then send"
  static let emptyDex = "No Dex matches"
  static let emptyUsage = "No usage matches"
  static let emptyTeams = "No saved teams match"
  static let emptyTeamsGuest = "Sign in to save teams"

  private static let kindOrder: [DexNameRow.Kind] = [.pokemon, .move, .ability, .item]

  static func phase(_ text: String) -> SlashPickerPhase {
    let trimmed = String(text.drop(while: \.isWhitespace))
    guard trimmed.hasPrefix("/") else { return .hidden }

    let token: String
    if let match = trimmed.range(of: #"^\S+"#, options: .regularExpression) {
      token = String(trimmed[match])
    } else {
      token = ""
    }
    let afterToken = trimmed.dropFirst(token.count)
    let hasSpaceAfter = afterToken.first?.isWhitespace == true

    if !hasSpaceAfter {
      let rows = filterCommands(token)
      if rows.isEmpty { return .hidden }
      return .commands(prefix: token, rows: rows)
    }

    guard let command = commands.first(where: { $0.token == token.lowercased() }) else {
      return .hidden
    }

    switch command.arg {
    case .dex: return .args(command: .dex, query: SlashCommands.slashArg(text))
    case .team: return .args(command: .team, query: SlashCommands.slashArg(text))
    case .usage: return .args(command: .usage, query: SlashCommands.slashArg(text))
    case .calc: return .args(command: .calc, query: SlashCommands.slashArg(text))
    case .none:
      let rest = String(command.token.dropFirst())
      if rest == "new" { return .rest(command: .new) }
      if rest == "help" { return .rest(command: .help) }
      return .hidden
    }
  }

  static func filterCommands(_ prefix: String) -> [SlashCommandRow] {
    let needle = prefix.lowercased()
    return commands.filter { $0.token.lowercased().hasPrefix(needle) }
  }

  static func insertCommand(_ token: String) -> String {
    guard let row = commands.first(where: { $0.token.lowercased() == token.lowercased() }) else {
      return token
    }
    return row.trailingSpace ? "\(row.token) " : row.token
  }

  static func insertName(_ commandToken: String, _ displayName: String) -> String {
    "\(commandToken) \(displayName)"
  }

  static func mergeDexNameRows(
    _ byKind: [(kind: DexNameRow.Kind, matches: [DexNameRow])],
    limit: Int = 8
  ) -> [DexNameRow] {
    var buckets: [DexNameRow.Kind: [DexNameRow]] = [:]
    for kind in kindOrder { buckets[kind] = [] }
    for group in byKind {
      buckets[group.kind, default: []].append(contentsOf: group.matches)
    }

    var seen = Set<String>()
    var merged: [DexNameRow] = []
    for kind in kindOrder {
      for row in buckets[kind] ?? [] {
        let key = "\(row.kind.rawValue):\(row.slug)"
        if seen.contains(key) { continue }
        seen.insert(key)
        merged.append(row)
        if merged.count >= limit { return merged }
      }
    }
    return merged
  }

  static func bindStillValid(_ bind: DexBind, composerText: String) -> Bool {
    let parsed = SlashCommands.parse(composerText, hasUsagePage: true)
    guard parsed == .navigate(target: .dex) else { return false }
    return SlashCommands.slashArg(composerText).lowercased() == bind.displayName.lowercased()
  }
}

/// One handled slash in the picker catalog.
struct SlashCommandRow: Equatable, Sendable {
  var token: String
  var hint: String
  var hintGuest: String? = nil
  var trailingSpace: Bool
  var arg: Arg

  enum Arg: String, Equatable, Sendable {
    case none
    case team
    case dex
    case usage
    case calc
  }
}

/// Derived picker phase from composer text.
enum SlashPickerPhase: Equatable, Sendable {
  case hidden
  case commands(prefix: String, rows: [SlashCommandRow])
  case args(command: ArgsCommand, query: String)
  case rest(command: RestCommand)

  enum ArgsCommand: String, Equatable, Sendable {
    case dex
    case team
    case usage
    case calc
  }

  enum RestCommand: String, Equatable, Sendable {
    case new
    case help
  }
}

/// One Dex / Usage name row in the arg-phase list.
struct DexNameRow: Equatable, Sendable, Identifiable {
  enum Kind: String, Equatable, Sendable {
    case pokemon
    case move
    case ability
    case item

    init?(entityKind: EntityKind) {
      switch entityKind {
      case .pokemon: self = .pokemon
      case .move: self = .move
      case .ability: self = .ability
      case .item: self = .item
      default: return nil
      }
    }

    var entityKind: EntityKind {
      switch self {
      case .pokemon: return .pokemon
      case .move: return .move
      case .ability: return .ability
      case .item: return .item
      }
    }

    var label: String {
      switch self {
      case .pokemon: return "Pokémon"
      case .move: return "Move"
      case .ability: return "Ability"
      case .item: return "Item"
      }
    }
  }

  var kind: Kind
  var slug: String
  var displayName: String
  var spriteUrl: String? = nil

  var id: String { "\(kind.rawValue):\(slug)" }
}

/// Composer-local Dex pick bind (not sent to the agent).
struct DexBind: Equatable, Sendable {
  var kind: DexNameRow.Kind
  var slug: String
  var displayName: String
}
