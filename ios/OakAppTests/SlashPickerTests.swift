import Foundation
import Testing

@testable import OakApp

/// Slash-discovery P3 lockstep oracle — composer `/` picker model.
///
/// Clones `web/src/lib/chat/slash-picker.test.ts`. Pure catalog / phase /
/// filter / insert / merge / bind — no I/O, no POST.
///
/// Expected types live in `ios/OakApp/Features/Chat/SlashPicker.swift`
/// (does not exist yet — this suite is expected red until P3 impl).
///
/// Expected API (web `slash-picker.ts` names):
///   `SlashPicker.commands`              ← `SLASH_COMMANDS`
///   `SlashPicker.phase(_:)`             ← `slashPickerPhase`
///     `.hidden`
///     `.commands(prefix:rows:)`
///     `.args(command:query:)`           command: `dex` | `team` | `usage`
///     `.rest(command:)`                 command: `calc` | `new` | `help`
///   `SlashPicker.filterCommands(_:)`
///   `SlashPicker.insertCommand(_:)`
///   `SlashPicker.insertName(_:_:)`      `insertName("/dex", "Garchomp")`
///   `SlashPicker.mergeDexNameRows(_:limit:)`
///   `SlashPicker.bindStillValid(_:composerText:)`
///   `SlashPicker.pickerCaption`         ← `PICKER_CAPTION` "Insert, then send"
///   `SlashPicker.emptyDex`              ← `EMPTY_DEX`
///   `SlashPicker.emptyUsage`            ← `EMPTY_USAGE`
///   `SlashPicker.emptyTeams`            ← `EMPTY_TEAMS`
///   `SlashPicker.emptyTeamsGuest`       ← `EMPTY_TEAMS_GUEST`
///
///   `SlashCommandRow`: token, hint, hintGuest?, trailingSpace, arg
///     arg: `none` | `team` | `dex` | `usage`
///   `DexNameRow` / `DexBind` share `DexNameRow.Kind`:
///     `pokemon` | `move` | `ability` | `item`
///
/// Hidden unless the first non-space char is `/`. Empty / whitespace /
/// mid-sentence (`please /dex`) → hidden (SD-AC-1.4). No space after first
/// token → `commands` with that token as prefix (including `/`); `/` lists
/// all six (SD-AC-1.2). `/DEX` with no space stays command phase (SD-AC-3.1).
/// Unknown first token (`/foo`, `/newish`) → hidden, not an empty command
/// list (SD-AC-1.3) — even though `filterCommands("/newish")` is `[]`.
/// Space after dex|team|usage → `args`. Space after /calc|/new|/help →
/// `rest` (no name rows) (SD-BR-6).
///
/// filterCommands: commandToken.lowercased().hasPrefix(prefix.lowercased()).
/// prefix "/" → all six. "/newish" → [].
/// insertCommand: trailing space iff catalog trailingSpace.
/// insertName("/dex", "Garchomp") === "/dex Garchomp" (single spaces).
/// mergeDexNameRows: Pokémon, then move, then ability, then item; within a
/// kind keep input order; dedupe kind+slug; cap `limit` default 8 (SD-BR-10,
/// SD-BR-17). Pass already-sliced-per-kind arrays; merge still caps.
/// bindStillValid(bind, composerText): parse is dex navigate AND slashArg
/// equals bind.displayName (case-insensitive).
///
/// Requirement refs: SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17,
/// SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-3.1, SD-AC-4.3, SD-AC-7.1.
struct SlashPickerTests {

  // MARK: SLASH_COMMANDS catalog (SD-AC-1.2)

  @Test
  func listsExactlyTheSixHandledTokensWithArchitectureHintsAndFlags() {
    #expect(
      SlashPicker.commands == [
        SlashCommandRow(
          token: "/new",
          hint: "New empty chat",
          trailingSpace: false,
          arg: .none
        ),
        SlashCommandRow(
          token: "/team",
          hint: "Open Teams",
          hintGuest: "Open Teams · sign in to save",
          trailingSpace: true,
          arg: .team
        ),
        SlashCommandRow(
          token: "/dex",
          hint: "Open Dex",
          trailingSpace: true,
          arg: .dex
        ),
        SlashCommandRow(
          token: "/usage",
          hint: "Open live usage",
          trailingSpace: true,
          arg: .usage
        ),
        SlashCommandRow(
          token: "/calc",
          hint: "Open calculator",
          trailingSpace: true,
          arg: .none
        ),
        SlashCommandRow(
          token: "/help",
          hint: "Show these commands",
          trailingSpace: false,
          arg: .none
        ),
      ]
    )
    #expect(SlashPicker.commands.map(\.token) == [
      "/new",
      "/team",
      "/dex",
      "/usage",
      "/calc",
      "/help",
    ])
  }

  // MARK: picker copy constants

  @Test
  func exportsThePickerCaptionAndArgPhaseEmptyLines() {
    #expect(SlashPicker.pickerCaption == "Insert, then send")
    #expect(SlashPicker.emptyDex == "No Dex matches")
    #expect(SlashPicker.emptyUsage == "No usage matches")
    #expect(SlashPicker.emptyTeams == "No saved teams match")
    #expect(SlashPicker.emptyTeamsGuest == "Sign in to save teams")
  }

  // MARK: filterCommands (SD-AC-1.2, SD-BR-5)

  @Test
  func keepsCommandsWhoseTokenStartsWithThePrefixCaseInsensitive() {
    #expect(SlashPicker.filterCommands("/").map(\.token) == [
      "/new",
      "/team",
      "/dex",
      "/usage",
      "/calc",
      "/help",
    ])
    #expect(SlashPicker.filterCommands("/") == SlashPicker.commands)
    #expect(SlashPicker.filterCommands("/de").map(\.token) == ["/dex"])
    #expect(SlashPicker.filterCommands("/DEX").map(\.token) == ["/dex"])
    #expect(SlashPicker.filterCommands("/n").map(\.token) == ["/new"])
    #expect(SlashPicker.filterCommands("/new").map(\.token) == ["/new"])
    #expect(SlashPicker.filterCommands("/h").map(\.token) == ["/help"])
  }

  @Test
  func returnsNoRowsForNewishNewDoesNotStartWithNewish() {
    #expect(SlashPicker.filterCommands("/newish") == [])
    #expect(SlashPicker.filterCommands("/foo") == [])
  }

  // MARK: slashPickerPhase

  @Test
  func isHiddenWhenTheFirstNonSpaceCharIsNotSlash() {
    #expect(SlashPicker.phase("") == .hidden)
    #expect(SlashPicker.phase("   ") == .hidden)
    #expect(SlashPicker.phase("please /dex") == .hidden)
    #expect(SlashPicker.phase("what about /team later") == .hidden)
  }

  @Test
  func opensCommandsForALeadingSlashPrefixAndListsAllSix() {
    #expect(
      SlashPicker.phase("/") == .commands(prefix: "/", rows: SlashPicker.commands)
    )
    #expect(
      SlashPicker.phase("  /") == .commands(prefix: "/", rows: SlashPicker.commands)
    )
  }

  @Test
  func filtersCommandRowsByTheFirstTokenWhileThereIsNoSpace() {
    let dex = SlashPicker.commands.filter { $0.token == "/dex" }
    let calc = SlashPicker.commands.filter { $0.token == "/calc" }
    let newChat = SlashPicker.commands.filter { $0.token == "/new" }
    let help = SlashPicker.commands.filter { $0.token == "/help" }

    #expect(SlashPicker.phase("/de") == .commands(prefix: "/de", rows: dex))
    #expect(SlashPicker.phase("/DEX") == .commands(prefix: "/DEX", rows: dex))
    #expect(SlashPicker.phase("/dex") == .commands(prefix: "/dex", rows: dex))
    #expect(SlashPicker.phase("/calc") == .commands(prefix: "/calc", rows: calc))
    #expect(SlashPicker.phase("/new") == .commands(prefix: "/new", rows: newChat))
    #expect(SlashPicker.phase("/help") == .commands(prefix: "/help", rows: help))
  }

  @Test
  func hidesForAnUnknownFirstTokenNotAnEmptyCommandList() {
    #expect(SlashPicker.phase("/newish") == .hidden)
    #expect(SlashPicker.phase("/foo") == .hidden)
    #expect(SlashPicker.filterCommands("/newish") == [])
  }

  @Test
  func entersArgsAfterASpaceOnDexTeamUsage() {
    #expect(
      SlashPicker.phase("/dex ") == .args(command: .dex, query: "")
    )
    #expect(
      SlashPicker.phase("/dex gar") == .args(command: .dex, query: "gar")
    )
    #expect(
      SlashPicker.phase("  /dex gar") == .args(command: .dex, query: "gar")
    )
    #expect(
      SlashPicker.phase("/DEX Garchomp") == .args(command: .dex, query: "Garchomp")
    )
    #expect(
      SlashPicker.phase("/team ") == .args(command: .team, query: "")
    )
    #expect(
      SlashPicker.phase("/team Rain Offense") == .args(command: .team, query: "Rain Offense")
    )
    #expect(
      SlashPicker.phase("/usage ") == .args(command: .usage, query: "")
    )
    #expect(
      SlashPicker.phase("/usage garchomp") == .args(command: .usage, query: "garchomp")
    )
  }

  @Test
  func entersRestAfterASpaceOnCalcNewHelpNoNameRows() {
    #expect(SlashPicker.phase("/calc ") == .rest(command: .calc))
    #expect(SlashPicker.phase("/calc foo vs bar") == .rest(command: .calc))
    #expect(SlashPicker.phase("/new ") == .rest(command: .new))
    #expect(SlashPicker.phase("/new rain team") == .rest(command: .new))
    #expect(SlashPicker.phase("/help ") == .rest(command: .help))
    #expect(SlashPicker.phase("/help extra words") == .rest(command: .help))

    if case .commands = SlashPicker.phase("/calc foo") {
      Issue.record("rest phase must not carry command rows (SD-BR-6)")
    }
    if case .args = SlashPicker.phase("/calc foo") {
      Issue.record("rest phase must not carry name-arg rows (SD-BR-6)")
    }
    if case .rest(let command) = SlashPicker.phase("/calc foo") {
      #expect(command == .calc)
    } else {
      Issue.record("expected rest phase for /calc foo")
    }
  }

  // MARK: insertCommand (SD-AC-2.1, SD-AC-2.2)

  @Test
  func appendsATrailingSpaceIffTheCatalogTrailingSpaceFlagIsTrue() {
    #expect(SlashPicker.insertCommand("/dex") == "/dex ")
    #expect(SlashPicker.insertCommand("/team") == "/team ")
    #expect(SlashPicker.insertCommand("/usage") == "/usage ")
    #expect(SlashPicker.insertCommand("/calc") == "/calc ")
    #expect(SlashPicker.insertCommand("/new") == "/new")
    #expect(SlashPicker.insertCommand("/help") == "/help")
  }

  // MARK: insertName (SD-AC-2.3)

  @Test
  func joinsCommandAndDisplayNameWithASingleSpaceAndNoRequiredTrailingSpace() {
    #expect(SlashPicker.insertName("/dex", "Garchomp") == "/dex Garchomp")
    #expect(SlashPicker.insertName("/usage", "Garchomp") == "/usage Garchomp")
    #expect(SlashPicker.insertName("/team", "Rain Offense") == "/team Rain Offense")
  }

  // MARK: mergeDexNameRows (SD-BR-10, SD-BR-17)

  @Test
  func ordersPokemonThenMoveThenAbilityThenItemKeepingWithinKindInputOrder() {
    let item = DexNameRow(kind: .item, slug: "metronome", displayName: "Metronome")
    let ability = DexNameRow(kind: .ability, slug: "rough-skin", displayName: "Rough Skin")
    let move = DexNameRow(kind: .move, slug: "earthquake", displayName: "Earthquake")
    let zamazenta = DexNameRow(kind: .pokemon, slug: "zamazenta", displayName: "Zamazenta")
    let garchomp = DexNameRow(
      kind: .pokemon,
      slug: "garchomp",
      displayName: "Garchomp",
      spriteUrl: "https://example.com/garchomp.png"
    )

    #expect(
      SlashPicker.mergeDexNameRows([
        (kind: .item, matches: [item]),
        (kind: .ability, matches: [ability]),
        (kind: .move, matches: [move]),
        (kind: .pokemon, matches: [zamazenta, garchomp]),
      ]) == [zamazenta, garchomp, move, ability, item]
    )
  }

  @Test
  func dedupesByKindAndSlugKeepingTheFirstOccurrence() {
    let first = DexNameRow(kind: .pokemon, slug: "garchomp", displayName: "Garchomp")
    let duplicate = DexNameRow(kind: .pokemon, slug: "garchomp", displayName: "GARCHOMP")
    let metronomeMove = DexNameRow(kind: .move, slug: "metronome", displayName: "Metronome")
    let metronomeItem = DexNameRow(kind: .item, slug: "metronome", displayName: "Metronome")

    #expect(
      SlashPicker.mergeDexNameRows([
        (kind: .pokemon, matches: [first, duplicate]),
        (kind: .move, matches: [metronomeMove]),
        (kind: .item, matches: [metronomeItem]),
      ]) == [first, metronomeMove, metronomeItem]
    )
  }

  @Test
  func capsAtLimitDefaultEightPreservingMergeOrder() {
    let pokemon = (0..<9).map { i in
      DexNameRow(kind: .pokemon, slug: "p\(i)", displayName: "P\(i)")
    }

    let capped = SlashPicker.mergeDexNameRows([(kind: .pokemon, matches: pokemon)])
    #expect(capped.count == 8)
    #expect(capped.map(\.slug) == ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"])
  }

  @Test
  func stillCapsAfterAlreadySlicedPerKindArrays() {
    func sliced(kind: DexNameRow.Kind, label: String) -> [DexNameRow] {
      (0..<8).map { i in
        DexNameRow(kind: kind, slug: "\(label)-\(i)", displayName: "\(label) \(i)")
      }
    }

    let merged = SlashPicker.mergeDexNameRows([
      (kind: .pokemon, matches: sliced(kind: .pokemon, label: "pokemon")),
      (kind: .move, matches: sliced(kind: .move, label: "move")),
      (kind: .ability, matches: sliced(kind: .ability, label: "ability")),
      (kind: .item, matches: sliced(kind: .item, label: "item")),
    ])

    #expect(merged.count == 8)
    #expect(merged.allSatisfy { $0.kind == .pokemon })
    #expect(merged.map(\.slug) == [
      "pokemon-0",
      "pokemon-1",
      "pokemon-2",
      "pokemon-3",
      "pokemon-4",
      "pokemon-5",
      "pokemon-6",
      "pokemon-7",
    ])
  }

  // MARK: bindStillValid (SD-BR-17)

  @Test
  func bindStillValidIsTrueWhenParseIsDexNavigateAndSlashArgEqualsDisplayName() {
    let garchomp = DexBind(kind: .pokemon, slug: "garchomp", displayName: "Garchomp")
    let metronomeMove = DexBind(kind: .move, slug: "metronome", displayName: "Metronome")

    #expect(SlashPicker.bindStillValid(garchomp, composerText: "/dex Garchomp"))
    #expect(SlashPicker.bindStillValid(garchomp, composerText: "/DEX garchomp"))
    #expect(SlashPicker.bindStillValid(garchomp, composerText: "  /dex GARCHOMP"))
    #expect(SlashPicker.bindStillValid(metronomeMove, composerText: "/dex Metronome"))
  }

  @Test
  func bindStillValidIsFalseWhenTheNameIsEditedTheComposerIsNotDexOrTheCommandChanges() {
    let garchomp = DexBind(kind: .pokemon, slug: "garchomp", displayName: "Garchomp")

    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/dex Garchom"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/dex GarchompX"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/dex"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/team Garchomp"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/usage Garchomp"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/calc Garchomp"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/new"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "/dexish Garchomp"))
    #expect(!SlashPicker.bindStillValid(garchomp, composerText: "please /dex Garchomp"))
  }
}
