import Foundation

/// Wire DTOs for `POST /api/teams/assistant` — the team-builder assistant docked
/// in the team editor. A deliberate SIBLING of the chat wire (``ChatWire.swift``),
/// NOT an extension: the terminal `answer` frame carries a ``BuilderAnswer`` (prose
/// + an optional ``TeamPatch``), NEVER an `OakAnswer`, and there is no `scope`
/// event (the request's `draft.format` IS the turn's scope).
///
/// Authoritative TS sources (the TS wins on any disagreement):
///   - `web/src/lib/sse/teams-assistant-sse-types.ts` — the request body
///     (`{ session_id, message, draft: { name, format, members } }`) and the event
///     map (`tool_activity` / `answer_start` / `answer_delta` / `answer` / `error`).
///   - `web/src/agent/teams-assistant/schemas.ts` — `builderAnswerSchema`,
///     `teamPatchSchema`, `applyTeamPatch`, `blankTeamMember` (the patch semantics
///     the server legality-gate AND this client's Apply both run, byte-for-byte).
///
/// Pure value types over the shared ``TeamMember``/``Format``/``StatSpread``
/// mirrors — no app-specific imports (the would-be shared package if an Android
/// client ever happens). Wire is `snake_case`; Swift is `camelCase`, mapped with
/// explicit per-type `CodingKeys` only where they differ.

// MARK: - Request

/// The live, unsaved on-screen draft, sent with EVERY assistant turn
/// (`TeamsAssistantDraft` in `teams-assistant-sse-types.ts`). `draft.format` IS
/// the turn's data scope — there is nothing for the server to resolve or announce.
struct TeamsAssistantDraft: Encodable, Sendable, Equatable {
  /// Current team-name input (may be empty).
  let name: String
  /// The draft's format — this IS the turn's data scope.
  let format: Format
  /// The editor's current members, in slot order (0-indexed, ≤ 6).
  let members: [TeamMember]
}

/// Request body for `POST /api/teams/assistant` (signed-in only).
struct TeamsAssistantRequest: Encodable, Sendable {
  /// Per-editor conversation id (client-generated; in-memory history only).
  let sessionId: String
  let message: String
  let draft: TeamsAssistantDraft

  private enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case message
    case draft
  }
}

// MARK: - Patch (builder output)

/// One slot-level edit (`teamPatchSlotSchema`). `member` is a FULL replacement
/// payload for that slot (never a partial-field merge); `member == nil` removes the
/// slot. `slot` indices refer to the PRE-patch draft.
struct TeamPatchSlot: Decodable, Sendable, Equatable {
  /// 0…5 in a well-formed payload (the Zod layer bounds it; ``applyTeamPatch``
  /// defends against out-of-range regardless).
  let slot: Int
  /// The full replacement member, or `nil` to remove the slot.
  let member: TeamMember?
}

/// A set of slot edits plus an optional rename (`teamPatchSchema`). An omitted/nil
/// `name` leaves the team name unchanged.
struct TeamPatch: Decodable, Sendable, Equatable {
  /// A proposed rename; `nil`/absent ⇒ unchanged.
  let name: String?
  /// Slot edits (0…6 of them).
  let slots: [TeamPatchSlot]
}

/// The builder assistant's whole answer (`builderAnswerSchema`). Deliberately tiny
/// next to `OakAnswer`: prose + an optional patch. `team_patch` absent/nil ⇒ an
/// advice-only turn (no edits proposed).
struct BuilderAnswer: Decodable, Sendable, Equatable {
  /// The assistant's prose (Markdown), streamed token-by-token as `answer_delta`s.
  let answerMarkdown: String
  /// Proposed slot edits, or `nil` for an advice-only turn.
  let teamPatch: TeamPatch?

  private enum CodingKeys: String, CodingKey {
    case answerMarkdown = "answer_markdown"
    case teamPatch = "team_patch"
  }
}

// MARK: - SSE events (sibling of ChatWire's `SSEEvent`)

/// One decoded server-sent event from the builder stream. Mirrors the chat event
/// order MINUS the `scope` event: `tool_activity`* → `answer_start`*/`answer_delta`*
/// → exactly one terminal `answer` (a ``BuilderAnswer``). An `error` event is
/// reserved for transport/API faults ONLY — every in-domain failure rides a normal
/// `answer` event (the runtime never throws in-domain), exactly like the chat route.
enum BuilderSSEEvent: Sendable, Equatable {
  /// `tool_activity` — one per tool call, shown as progress while the loop runs.
  case toolActivity(tool: String, label: String)
  /// `answer_start` — re-emit reset: the client clears its in-flight markdown buffer.
  case answerStart
  /// `answer_delta` — one incremental chunk of `answer_markdown`.
  case answerDelta(text: String)
  /// `answer` — the single terminal, authoritative ``BuilderAnswer`` for the turn.
  case answer(BuilderAnswer)
  /// `error` — transport/API fault only (never an in-domain failure).
  case error(code: String, message: String, status: Int?)
}

extension BuilderSSEEvent {
  /// `event: tool_activity` data payload (sibling of `SSEEvent.ToolActivityData`;
  /// kept local so the builder module never depends on the chat wire).
  struct ToolActivityData: Decodable, Sendable {
    let tool: String
    let label: String
  }

  /// `event: answer_delta` data payload.
  struct AnswerDeltaData: Decodable, Sendable {
    let text: String
  }

  /// `event: answer` data payload — wraps the terminal ``BuilderAnswer``.
  struct AnswerData: Decodable, Sendable {
    let answer: BuilderAnswer
  }

  /// `event: error` data payload — transport faults only.
  struct ErrorData: Decodable, Sendable {
    let code: String
    let message: String
    /// Upstream HTTP status for a provider transport fault, when known.
    let status: Int?
  }

  // The `answer_start` frame carries an empty object `{}`; it has no payload struct
  // — the parser maps the bare event name straight to `.answerStart`.
}

// MARK: - Patch semantics (ported from schemas.ts — the SAME logic the server ran)

/// A fresh, empty member used to pad gaps when a patch targets a slot beyond the
/// draft's current length (partial team allowed; IVs default 31, level 50 — mirrors
/// `blankTeamMember` in `schemas.ts` and the editor's blank slot).
func blankTeamMember() -> TeamMember {
  TeamMember(
    species: nil,
    ability: nil,
    item: nil,
    moves: [],
    nature: nil,
    evs: StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0),
    ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
    teraType: nil,
    level: 50,
    nickname: nil,
    gender: nil,
    shiny: nil
  )
}

/// Apply a patch to a draft's members. Pure — returns a new array, never mutates.
/// Slot indices refer to the PRE-patch draft (mirrors `applyTeamPatch` in
/// `schemas.ts` exactly, so validated and applied results can't diverge):
///   1. every `member != nil` op replaces (or, past the end, extends — gaps padded
///      with ``blankTeamMember()``) its slot;
///   2. every `member == nil` op marks its pre-patch slot for removal;
///   3. removals compact the array last, preserving order; the result is capped at 6.
func applyTeamPatch(_ members: [TeamMember], _ patch: TeamPatch) -> [TeamMember] {
  var next: [TeamMember?] = members.map { $0 }
  var removals: [TeamPatchSlot] = []
  for op in patch.slots {
    if op.member == nil {
      removals.append(op)
      continue
    }
    while next.count <= op.slot { next.append(blankTeamMember()) }
    next[op.slot] = op.member
  }
  for op in removals where op.slot < next.count {
    next[op.slot] = nil
  }
  return Array(next.compactMap { $0 }.prefix(6))
}

/// Human-readable one-liners for a patch's operations (mirrors `describePatch` in
/// `TeamsAssistantPanel.tsx` — same curly quotes, em-dash, and middot separators).
func describeTeamPatch(_ patch: TeamPatch) -> [String] {
  var lines: [String] = []
  if let name = patch.name {
    lines.append("Rename team to \u{201C}\(name)\u{201D}")
  }
  for op in patch.slots {
    let n = op.slot + 1
    guard let member = op.member else {
      lines.append("Slot \(n): remove")
      continue
    }
    let species = member.species.map(titleizeTeamSlug) ?? "(empty)"
    var bits: [String] = []
    if let ability = member.ability { bits.append(titleizeTeamSlug(ability)) }
    if let item = member.item { bits.append(titleizeTeamSlug(item)) }
    if !member.moves.isEmpty {
      bits.append(member.moves.map(titleizeTeamSlug).joined(separator: " / "))
    }
    if let nature = member.nature { bits.append("\(titleizeTeamSlug(nature)) nature") }
    let suffix = bits.isEmpty ? "" : " \u{2014} " + bits.joined(separator: " \u{00B7} ")
    lines.append("Slot \(n): \(species)\(suffix)")
  }
  return lines
}

/// Title-case a slug for display ("great-tusk" → "Great Tusk") — mirrors
/// `titleizeSlug` in `web/src/components/teams/display-names.ts`.
func titleizeTeamSlug(_ value: String) -> String {
  value
    .split(whereSeparator: { $0 == "-" || $0.isWhitespace })
    .map { $0.prefix(1).uppercased() + $0.dropFirst() }
    .joined(separator: " ")
}
