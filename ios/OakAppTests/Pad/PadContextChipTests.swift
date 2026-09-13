import Foundation
import Testing

@testable import OakApp

/// Pins `PadContextChip.apply(to:)` for every row in
/// `docs/features/ipad-app/architecture/api-design.md` (P-SHELL-US-3,
/// P-SHELL-AC-3.1–3.3, ADR-P4).
///
/// Production type lives in `ios/OakApp/Pad/Chat/PadContextChip.swift` and
/// does not exist until Phase 6 — missing type / method is the red compile.
///
/// Expected API:
/// ```
/// enum PadContextChip: Equatable, Sendable {
///   case team(id: String, name: String, liveShowdown: String)
///   case pokemon(slug: String, name: String)
///   case move(slug: String, name: String)
///   case ability(slug: String, name: String)
///   case item(slug: String, name: String)
///   case usageSpecies(slug: String, name: String)
///   /// Explain prompt already built (CalculatorViewModel.explainPrompt /
///   /// pendingChatSend). Do not invent a new HTTP payload.
///   case calc(explainPrompt: String)
///   func apply(to message: String) -> (text: String, mentionedTeamIds: [String]?)
/// }
/// extension Optional where Wrapped == PadContextChip {
///   func apply(to message: String) -> (text: String, mentionedTeamIds: [String]?)
/// }
/// ```
///
/// Table (`api-design.md`):
///   nil → text unchanged, mentionedTeamIds nil
///   team + empty liveShowdown → text unchanged, mentionedTeamIds [id]
///   team + non-empty liveShowdown → append
///     `\n\nLive team draft (\(name)):\n```\n{showdown}\n````
///     mentionedTeamIds [id]
///   pokemon/move/ability/item/usageSpecies → prefix `Regarding {name}.\n\n`
///     + user, mentionedTeamIds nil (VM still binds `@` mentions)
///   calc → `explainPrompt` when user is empty; else
///     `explainPrompt + "\n\n" + user`; mentionedTeamIds nil
///
/// `@` union for a team chip is `ChatViewModel.extraMentionedTeamIds`, not
/// this mapping (`ChatViewModelExtraMentionsTests`).
///
/// Requirement refs: P-SHELL-US-3, P-SHELL-AC-3.1–3.3, P-SHELL-BR-2,
/// P-CHAT-BR-4, P-TEAM-US-4, ADR-P4, P-API-BR-3.
struct PadContextChipTests {

  // MARK: nil chip (P-SHELL-AC-3.3 dismissed → normal turn)

  @Test
  func nilChipLeavesMessageUnchangedAndMentionsNil() {
    let chip: PadContextChip? = nil
    let applied = chip.apply(to: "How does this look?")
    #expect(applied.text == "How does this look?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func nilChipDoesNotInventAPayloadOnEmptyUserText() {
    let chip: PadContextChip? = nil
    let applied = chip.apply(to: "")
    #expect(applied.text == "")
    #expect(applied.mentionedTeamIds == nil)
  }

  // MARK: team — empty live Showdown (mention bind is enough; ADR-P4)

  @Test
  func teamChipWithEmptyShowdownLeavesTextAndBindsId() {
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: ""
    )
    let applied = chip.apply(to: "How does this look?")
    #expect(applied.text == "How does this look?")
    #expect(applied.mentionedTeamIds == ["team-rain-1"])
  }

  @Test
  func teamChipWithEmptyShowdownDoesNotParseAtMentions() {
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: ""
    )
    let applied = chip.apply(to: "Compare with @Sun Core")
    #expect(applied.text == "Compare with @Sun Core")
    #expect(applied.mentionedTeamIds == ["team-rain-1"])
  }

  // MARK: team — live draft appended into the sent user text (ADR-P4)

  @Test
  func teamChipWithLiveShowdownAppendsFencedDraft() {
    let showdown = "Garchomp @ Choice Scarf\nAbility: Rough Skin"
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: showdown
    )
    let user = "How does this look?"
    let applied = chip.apply(to: user)
    #expect(
      applied.text
        == user + "\n\nLive team draft (Rain Offense):\n```\n\(showdown)\n```"
    )
    #expect(applied.mentionedTeamIds == ["team-rain-1"])
  }

  @Test
  func teamChipWhitespaceOnlyShowdownLeavesTextAndBindsId() {
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: "  \n  "
    )
    let applied = chip.apply(to: "How does this look?")
    #expect(applied.text == "How does this look?")
    #expect(applied.mentionedTeamIds == ["team-rain-1"])
  }

  @Test
  func teamChipTrimsShowdownBeforeFencing() {
    let chip = PadContextChip.team(
      id: "team-2",
      name: "Balance",
      liveShowdown: "  Kingambit @ Black Glasses\n  "
    )
    let applied = chip.apply(to: "speed tiers?")
    #expect(
      applied.text
        == "speed tiers?\n\nLive team draft (Balance):\n```\nKingambit @ Black Glasses\n```"
    )
    #expect(applied.mentionedTeamIds == ["team-2"])
  }

  @Test
  func teamChipShowdownFenceUsesTheTeamName() {
    let chip = PadContextChip.team(
      id: "team-2",
      name: "Balance",
      liveShowdown: "Kingambit @ Black Glasses"
    )
    let applied = chip.apply(to: "speed tiers?")
    #expect(applied.text.contains("Live team draft (Balance):"))
    #expect(!applied.text.contains("Live team draft (team-2):"))
    #expect(applied.mentionedTeamIds == ["team-2"])
  }

  // MARK: Dex / Usage objects — Regarding {name}. (P-SHELL-AC-3.2)

  @Test
  func pokemonChipPrefixesRegardingName() {
    let chip = PadContextChip.pokemon(slug: "garchomp", name: "Garchomp")
    let applied = chip.apply(to: "What item?")
    #expect(applied.text == "Regarding Garchomp.\n\nWhat item?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func moveChipPrefixesRegardingName() {
    let chip = PadContextChip.move(slug: "earthquake", name: "Earthquake")
    let applied = chip.apply(to: "Does this KO?")
    #expect(applied.text == "Regarding Earthquake.\n\nDoes this KO?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func abilityChipPrefixesRegardingName() {
    let chip = PadContextChip.ability(slug: "rough-skin", name: "Rough Skin")
    let applied = chip.apply(to: "contact damage?")
    #expect(applied.text == "Regarding Rough Skin.\n\ncontact damage?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func itemChipPrefixesRegardingName() {
    let chip = PadContextChip.item(slug: "choice-scarf", name: "Choice Scarf")
    let applied = chip.apply(to: "speed calc")
    #expect(applied.text == "Regarding Choice Scarf.\n\nspeed calc")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func usageSpeciesChipPrefixesRegardingName() {
    let chip = PadContextChip.usageSpecies(slug: "garchomp", name: "Garchomp")
    let applied = chip.apply(to: "Why is it #1?")
    #expect(applied.text == "Regarding Garchomp.\n\nWhy is it #1?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func entityChipUsesDisplayNameNotSlug() {
    let chip = PadContextChip.pokemon(slug: "walking-wake", name: "Walking Wake")
    let applied = chip.apply(to: "sets?")
    #expect(applied.text == "Regarding Walking Wake.\n\nsets?")
    #expect(!applied.text.contains("walking-wake"))
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func entityChipWithEmptyUserStillPrefixes() {
    let chip = PadContextChip.pokemon(slug: "garchomp", name: "Garchomp")
    let applied = chip.apply(to: "")
    #expect(applied.text == "Regarding Garchomp.\n\n")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func entityChipDoesNotBindTeamIdsEvenWhenUserHasAtToken() {
    let chip = PadContextChip.move(slug: "earthquake", name: "Earthquake")
    let applied = chip.apply(to: "on @Rain Offense")
    #expect(applied.text == "Regarding Earthquake.\n\non @Rain Offense")
    #expect(applied.mentionedTeamIds == nil)
  }

  // MARK: calc — reuse Explain prompt string (api-design.md, no new HTTP)

  @Test
  func calcChipWithEmptyUserSendsExplainPromptOnly() {
    let prompt =
      "Explain this damage estimate (do not re-roll unless needed).\nGarchomp Earthquake vs Farigiraf"
    let chip = PadContextChip.calc(explainPrompt: prompt)
    let applied = chip.apply(to: "")
    #expect(applied.text == prompt)
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func calcChipConcatenatesExplainPromptAndUserWithBlankLine() {
    let prompt =
      "Explain this damage estimate (do not re-roll unless needed).\nGarchomp Earthquake vs Farigiraf"
    let chip = PadContextChip.calc(explainPrompt: prompt)
    let applied = chip.apply(to: "Why the high roll?")
    #expect(applied.text == prompt + "\n\nWhy the high roll?")
    #expect(applied.mentionedTeamIds == nil)
  }

  @Test
  func calcChipDoesNotInventContextJSON() {
    let chip = PadContextChip.calc(explainPrompt: "Explain this damage estimate.")
    let applied = chip.apply(to: "notes")
    #expect(!applied.text.contains("\"context\""))
    #expect(!applied.text.contains("context:"))
    #expect(applied.mentionedTeamIds == nil)
  }
}
