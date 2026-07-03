import Foundation
import Testing

@testable import OakApp

/// Contract + patch-semantics tests for the team-builder assistant wire
/// (`TeamsAssistantWire.swift`). The Swift mirrors decode from committed fixtures
/// (never inline literals, so a contract change fails loudly), the sibling
/// ``BuilderSSEParser`` round-trips a full `.sse` turn, and ``applyTeamPatch`` is pinned
/// against the exact cases web's `schemas.test.ts` pins — it is the SAME pure logic the
/// server legality-gate ran, so applied ≡ validated.
struct TeamsAssistantWireTests {

  // MARK: Fixture decoding

  @Test
  func builderAnswerWithPatchDecodes() throws {
    let answer = try Fixtures.decode(BuilderAnswer.self, from: "teams_assistant_answer_patch.json")
    #expect(answer.answerMarkdown.contains("Great Tusk"))
    let patch = try #require(answer.teamPatch)
    #expect(patch.name == nil)
    #expect(patch.slots.count == 1)
    #expect(patch.slots.first?.slot == 2)
    let member = try #require(patch.slots.first?.member)
    #expect(member.species == "great-tusk")
    #expect(member.ability == "protosynthesis")
    #expect(member.item == "booster-energy")
    #expect(member.moves == ["headlong-rush", "close-combat", "rapid-spin", "ice-spinner"])
    #expect(member.teraType == "ground")
  }

  @Test
  func adviceOnlyAnswerHasNoPatch() throws {
    let answer = try Fixtures.decode(
      BuilderAnswer.self, from: "teams_assistant_answer_advice.json")
    #expect(answer.answerMarkdown.isEmpty == false)
    #expect(answer.teamPatch == nil)
  }

  // MARK: SSE round-trip through the sibling parser

  /// A full builder turn parsed by the PRODUCTION ``BuilderSSEParser`` (fed line-by-line
  /// like the byte loop does): tool_activity → answer_start → answer_delta* → answer,
  /// with the heartbeat comment skipped and the terminal `BuilderAnswer` decoded.
  @Test
  func fullTurnParsesThroughBuilderParser() throws {
    let events = try parseBuilderSSE("teams_assistant_patch.sse")

    // tool_activity → answer_start → answer_delta × 2 → answer (heartbeat comment skipped).
    #expect(events.count == 5)
    guard case let .toolActivity(tool, label) = events[0] else {
      Issue.record("expected tool_activity first")
      return
    }
    #expect(tool == "get_learnset")
    #expect(label.isEmpty == false)

    #expect(events[1] == .answerStart)

    guard case let .answerDelta(first) = events[2], case let .answerDelta(second) = events[3]
    else {
      Issue.record("expected two answer_delta frames")
      return
    }
    #expect(first == "Slot 3 is bare. I'd run ")
    #expect(second.contains("Great Tusk"))

    guard case let .answer(answer) = events[4] else {
      Issue.record("expected terminal answer")
      return
    }
    #expect(answer.teamPatch?.slots.first?.member?.species == "great-tusk")
  }

  /// A chat-only `scope` frame is ignored by the builder parser (no such event exists
  /// on this route), and a recognized event with malformed JSON throws `.decoding`.
  @Test
  func builderParserIgnoresScopeAndRejectsBadJSON() throws {
    var parser = BuilderSSEParser()
    var out: [BuilderSSEEvent] = []
    out += try parser.consume(line: "event: scope")
    out += try parser.consume(line: "data: {\"format\":\"champions\"}")
    out += try parser.consume(line: "")  // dispatch the scope frame → ignored
    #expect(out.isEmpty)

    var bad = BuilderSSEParser()
    _ = try bad.consume(line: "event: answer")
    #expect(throws: OakError.self) {
      _ = try bad.consume(line: "data: {nope")
      _ = try bad.consume(line: "")
    }
  }

  // MARK: Request encoding shape

  /// The request body serializes to the wire contract: `session_id`, `message`, and a
  /// strict `draft` whose `format` is the raw string and whose members carry the
  /// nullable-required keys explicitly (a `null` `ability`, not an omitted key).
  @Test
  func requestEncodesToTheWireShape() throws {
    let request = TeamsAssistantRequest(
      sessionId: "sess-1",
      message: "Fill slot 3",
      draft: TeamsAssistantDraft(name: "Rain", format: .gen7, members: [blankTeamMember()])
    )
    let data = try JSONEncoder().encode(request)
    let json = try #require(
      try JSONSerialization.jsonObject(with: data) as? [String: Any])

    #expect(json["session_id"] as? String == "sess-1")
    #expect(json["message"] as? String == "Fill slot 3")
    let draft = try #require(json["draft"] as? [String: Any])
    #expect(draft["name"] as? String == "Rain")
    #expect(draft["format"] as? String == "gen-7")
    let members = try #require(draft["members"] as? [[String: Any]])
    #expect(members.count == 1)
    // Nullable-required key present as an explicit null (server `.strict()` needs it).
    #expect(members[0].keys.contains("ability"))
    #expect(members[0]["ability"] is NSNull)
    #expect(members[0]["level"] as? Int == 50)
  }

  // MARK: applyTeamPatch — ports web's schemas.test.ts cases

  @Test
  func replacesOneSlotWithAFullReplacement() {
    let members = [member("a"), member("b")]
    let patch = TeamPatch(name: nil, slots: [TeamPatchSlot(slot: 1, member: member("b2"))])
    let result = applyTeamPatch(members, patch)
    #expect(result.map(\.species) == ["a", "b2"])
  }

  @Test
  func removesASlotViaNullCompactingAndPreservingOrder() {
    let members = [member("a"), member("b"), member("c")]
    let patch = TeamPatch(name: nil, slots: [TeamPatchSlot(slot: 1, member: nil)])
    let result = applyTeamPatch(members, patch)
    #expect(result.map(\.species) == ["a", "c"])
  }

  @Test
  func padsGapsWhenTargetingASlotPastTheDraftLength() {
    let members = [member("a")]
    let patch = TeamPatch(name: nil, slots: [TeamPatchSlot(slot: 2, member: member("c"))])
    let result = applyTeamPatch(members, patch)
    #expect(result.count == 3)
    #expect(result[0].species == "a")
    #expect(result[1] == blankTeamMember())
    #expect(result[2].species == "c")
  }

  @Test
  func resolvesEverySlotIndexAgainstThePrePatchDraft() {
    // slot 1 replace + slot 0 remove in the SAME patch: both indices refer to the
    // original [a, b, c] — the removal must not shift the replace's target.
    let members = [member("a"), member("b"), member("c")]
    let patch = TeamPatch(
      name: nil,
      slots: [
        TeamPatchSlot(slot: 1, member: member("b2")),
        TeamPatchSlot(slot: 0, member: nil),
      ]
    )
    let result = applyTeamPatch(members, patch)
    #expect(result.map(\.species) == ["b2", "c"])
  }

  @Test
  func capsTheResultAtSixMembers() {
    let members = ["a", "b", "c", "d", "e", "f"].map(member)
    // slot 6 bypasses the Zod 0…5 bound — exercise the defensive prefix(6).
    let patch = TeamPatch(name: nil, slots: [TeamPatchSlot(slot: 6, member: member("g"))])
    let result = applyTeamPatch(members, patch)
    #expect(result.count == 6)
    #expect(result.map(\.species) == ["a", "b", "c", "d", "e", "f"])
  }

  @Test
  func appliesARenameFromThePatch() {
    let patch = TeamPatch(name: "Sun Squad", slots: [])
    #expect(patch.name == "Sun Squad")
    // The rename is applied by the editor bridge, not applyTeamPatch (members-only);
    // an empty-slots patch leaves members untouched.
    let members = [member("a"), member("b")]
    #expect(applyTeamPatch(members, patch).map(\.species) == ["a", "b"])
  }

  // MARK: describeTeamPatch — mirrors the web panel's human-readable lines

  @Test
  func describesRenameAndSlotEdits() {
    let patch = TeamPatch(
      name: "Sun Squad",
      slots: [
        TeamPatchSlot(slot: 2, member: member("great-tusk")),
        TeamPatchSlot(slot: 4, member: nil),
      ]
    )
    let lines = describeTeamPatch(patch)
    #expect(lines.count == 3)
    #expect(lines[0] == "Rename team to \u{201C}Sun Squad\u{201D}")
    #expect(lines[1].hasPrefix("Slot 3: Great Tusk"))
    #expect(lines[2] == "Slot 5: remove")
  }

  @Test
  func titleizesSlugsWithHyphensAndSpaces() {
    #expect(titleizeTeamSlug("great-tusk") == "Great Tusk")
    #expect(titleizeTeamSlug("booster-energy") == "Booster Energy")
  }

  // MARK: Helpers

  /// A blank member tagged with `species` so slot identity is easy to assert (mirrors
  /// `m()` in web's schemas.test.ts).
  private func member(_ species: String) -> TeamMember {
    let base = blankTeamMember()
    return TeamMember(
      species: species,
      ability: base.ability,
      item: base.item,
      moves: base.moves,
      nature: base.nature,
      evs: base.evs,
      ivs: base.ivs,
      teraType: base.teraType,
      level: base.level,
      nickname: base.nickname,
      gender: base.gender,
      shiny: base.shiny
    )
  }

  /// Parse a committed `.sse` fixture through the PRODUCTION ``BuilderSSEParser``,
  /// fed line-by-line the way the shared byte loop feeds it.
  private func parseBuilderSSE(_ name: String) throws -> [BuilderSSEEvent] {
    let body = try Fixtures.string(name)
    var parser = BuilderSSEParser()
    var out: [BuilderSSEEvent] = []
    for line in body.components(separatedBy: "\n") {
      out += try parser.consume(line: line)
    }
    out += try parser.finish()
    return out
  }
}
