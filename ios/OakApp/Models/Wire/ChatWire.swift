import Foundation

/// Wire DTOs for `POST /api/chat` — the request body and the SSE event stream.
///
/// Faithful mirror of the TypeScript contract in `web/src/lib/sse/sse-types.ts`
/// (data-model.md "Wire DTOs"). The TS source is authoritative; if it changes,
/// these mirrors must change (a round-trip decode test guards the drift).
///
/// Mapping rule (conventions.md): the wire mixes conventions, so each type maps
/// fields with EXPLICIT `CodingKeys` rather than a global `.convertFromSnakeCase`
/// — e.g. `session_id`/`scope_seed` are snake_case but the image's `mimeType`
/// is intentionally camelCase on the wire.

// MARK: - Request

/// Replace-last-pair mode on `POST /api/chat` (REC-US-1/2 / ADR-4).
enum ChatRecovery: String, Encodable, Sendable {
    case retry
    case edit
}

/// Request body for `POST /api/chat`.
///
/// Saved teams are referenced **by name in chat** (resolved server-side via
/// `list_teams` / `get_team`) **or** bound by `mentionedTeamIds` (MEN-US-1).
struct ChatRequest: Encodable, Sendable {
    /// Client UUID for the thread; equals the conversation id on resume.
    let sessionId: String
    /// 0–2000 chars. MAY be empty when one or more `images` are present.
    let message: String
    /// Images attached to this turn (≤ 4). `nil` ⇒ a text-only turn.
    let images: [ChatImage]?
    /// An explicit scope pick from the header scope chip, applied as this turn's
    /// seed (`scope_seed`, mirroring `ChatRequestBody.scope_seed` in
    /// `web/src/lib/sse/sse-types.ts`). Encoded as its `Format` rawValue string;
    /// `nil` ⇒ no pick, so the server falls through to the conversation's sticky
    /// scope, else the champions default.
    ///
    /// The deprecated `champions_mode` boolean is deliberately NOT on this body:
    /// server-side scope precedence (in-message signal > `scope_seed` > sticky >
    /// champions default) makes its absence a no-op, and champions IS the default.
    let scopeSeed: Format?
    /// Replace last pair on success. `nil` ⇒ a normal append.
    let recovery: ChatRecovery?
    /// Stable team UUIDs to bind this turn. Max 6, unique. `nil`/empty ⇒ none.
    let mentionedTeamIds: [String]?

    init(
        sessionId: String,
        message: String,
        images: [ChatImage]?,
        scopeSeed: Format?,
        recovery: ChatRecovery? = nil,
        mentionedTeamIds: [String]? = nil
    ) {
        self.sessionId = sessionId
        self.message = message
        self.images = images
        self.scopeSeed = scopeSeed
        self.recovery = recovery
        self.mentionedTeamIds = mentionedTeamIds
    }

    private enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case message
        case images
        case scopeSeed = "scope_seed"
        case recovery
        case mentionedTeamIds = "mentioned_team_ids"
    }
}

/// One image attached to a chat message (wire shape).
///
/// `data` is RAW base64 with NO `data:` prefix. `mimeType` is the client's
/// best-effort declaration; the server re-sniffs the bytes by magic number to
/// determine the canonical MIME type.
struct ChatImage: Encodable, Sendable {
    /// Best-effort MIME type, e.g. `"image/jpeg"`. Intentionally camelCase on the wire.
    let mimeType: String
    /// RAW base64-encoded image bytes (no `data:` prefix).
    let data: String

    // `mimeType` stays camelCase on the wire by design — do NOT remap it.
    private enum CodingKeys: String, CodingKey {
        case mimeType
        case data
    }
}

// MARK: - SSE events

/// One decoded server-sent event from the chat stream.
///
/// The endpoint emits, in order (background-turns/design.md §4): `turn` (exactly
/// one, FIRST — the server-minted turn id) → `scope` (exactly one) →
/// `tool_activity`* → `answer_start`*/`answer_delta`* → exactly one terminal
/// `answer` | `error` | `stopped`. The `answer` event is authoritative; an
/// `error` event is reserved for transport/API faults ONLY — every in-domain
/// failure (unresolved entity, clarification, index missing, loop-max) rides a
/// normal `answer` event whose `OakAnswer.status` carries the failure; a `stopped`
/// event is the terminal alternative when the turn was explicitly stopped.
///
/// The `turn` frame opens BOTH the POST stream and the resume stream, so a client
/// records it as the conversation's pending turn (to later reattach/stop) and, on
/// reattach, rebuilds its in-flight UI from scratch when it arrives.
///
/// `event:`-name decoding lives in `SSEParser`; this type only models the events
/// and (via the nested `*Data` payloads below) the way to decode each frame's
/// `data:` JSON.
enum SSEEvent: Sendable, Equatable {
    /// `turn` — the server-minted turn id (`TurnEvent`), emitted exactly once as
    /// the FIRST frame of both the POST and resume streams (BT-2). Recorded as the
    /// conversation's pending turn; on a resume it resets the in-flight UI.
    case turn(turnId: String)
    /// `scope` — the server-resolved game scope for this turn (`ScopeEvent`),
    /// emitted once, before any `tool_activity`. Drives the header scope chip.
    case scope(format: Format, source: ScopeSource)
    /// `tool_activity` — one per tool call, shown as progress while the loop runs.
    case toolActivity(tool: String, label: String)
    /// `answer_start` — re-emit reset: the client clears its in-flight markdown buffer.
    case answerStart
    /// `answer_delta` — one incremental chunk of `answer_markdown`.
    case answerDelta(text: String)
    /// `answer` — the single terminal, authoritative answer for the turn.
    case answer(OakAnswer)
    /// `error` — transport/API fault only (never an in-domain failure).
    case error(code: String, message: String, status: Int?)
    /// `stopped` — terminal: the turn was explicitly stopped (BT-4). Nothing is
    /// persisted; the client discards the in-flight turn and clears its pending id.
    case stopped
}

/// How the server resolved a turn's scope — the `source` field of the `scope`
/// SSE event (`ScopeEvent.source` in `web/src/lib/sse/sse-types.ts`):
///   - `.message` — an explicit in-message signal ("in gen 7, …");
///   - `.seed` — the client's `scope_seed` chip pick (or a legacy `champions_mode`);
///   - `.conversation` — the conversation's sticky scope;
///   - `.preference` — the signed-in account's last-used scope (new-chat default);
///   - `.default` — the National Dex hard default (no signal/seed/sticky/preference).
///
/// **Tolerant decoding (`.unknown`)** mirrors ``Format``: the server can add a
/// resolution source independently of when this app ships, so an unrecognized
/// value degrades to `.unknown(raw)` rather than failing the frame's decode. The
/// client uses the scope's `format` for display; `source` is informational.
enum ScopeSource: Sendable, Equatable {
    case message
    case conversation
    case seed
    case preference
    case `default`
    /// A source string not in the known set — preserves the original wire value.
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "message": self = .message
        case "conversation": self = .conversation
        case "seed": self = .seed
        case "preference": self = .preference
        case "default": self = .default
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .message: return "message"
        case .conversation: return "conversation"
        case .seed: return "seed"
        case .preference: return "preference"
        case .default: return "default"
        case let .unknown(raw): return raw
        }
    }
}

extension ScopeSource: Decodable {
    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }
}

extension SSEEvent {
    /// `event: turn` data payload — the server-minted turn id (`TurnEvent` in
    /// `web/src/lib/sse/sse-types.ts`). The `turn_id` is snake_case on the wire.
    struct TurnData: Decodable, Sendable {
        let turnId: String

        enum CodingKeys: String, CodingKey {
            case turnId = "turn_id"
        }
    }

    /// `event: scope` data payload — the server-resolved game scope for this turn
    /// (`ScopeEvent`). `format` decodes tolerantly (unknown → `.unknown(raw)`), and
    /// so does `source`, so a widened wire never fails the frame.
    struct ScopeData: Decodable, Sendable {
        let format: Format
        let source: ScopeSource
    }

    /// `event: tool_activity` data payload.
    struct ToolActivityData: Decodable, Sendable {
        let tool: String
        let label: String
    }

    /// `event: answer_delta` data payload.
    struct AnswerDeltaData: Decodable, Sendable {
        let text: String
    }

    /// `event: answer` data payload — wraps the terminal `OakAnswer`.
    struct AnswerData: Decodable, Sendable {
        let answer: OakAnswer
    }

    /// `event: error` data payload — transport faults only.
    struct ErrorData: Decodable, Sendable {
        let code: String
        let message: String
        /// Upstream HTTP status for a provider transport fault, when known.
        let status: Int?
    }

    // The `answer_start` frame carries an empty object `{}`; it has no payload
    // struct — the parser maps the bare event name straight to `.answerStart`.
}
