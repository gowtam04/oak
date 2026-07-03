import Foundation

/// One team-builder assistant turn → a live ``BuilderSSEEvent`` stream (the sibling
/// of ``ChatService`` for `POST /api/teams/assistant`). View models depend on this
/// **protocol** (never `LiveTeamsAssistantService`) so they unit-test against a fake.
///
/// The method is synchronous and returns the stream immediately. The endpoint is
/// SIGNED-IN ONLY (teams are account-scoped): a guest's missing Bearer surfaces as a
/// `401` → `OakError.unauthorized` thrown from the stream before any event is
/// yielded, and a rate-limit as `OakError.rateLimited`. Every in-domain failure rides
/// a normal `.answer` event whose ``BuilderAnswer`` carries the response — never the
/// `error` channel (mirrors the chat contract).
protocol TeamsAssistantService: Sendable {
  /// Opens the assistant stream for one turn.
  ///
  /// - `sessionId`: the per-editor conversation id (in-memory history only, server-side).
  /// - `message`: the user's typed request.
  /// - `draft`: the LIVE, unsaved editor draft (name/format/members) — rides EVERY
  ///   turn, since `draft.format` IS the turn's scope and the model reasons over the
  ///   current on-screen team.
  func send(
    sessionId: String,
    message: String,
    draft: TeamsAssistantDraft
  ) -> AsyncThrowingStream<BuilderSSEEvent, Error>
}

/// Production ``TeamsAssistantService`` over ``SSEClient`` (which borrows
/// ``OakAPIClient`` for the Bearer header + base URL). A value type over one immutable
/// struct, so it is `Sendable` without ceremony.
struct LiveTeamsAssistantService: TeamsAssistantService {
  private let sseClient: SSEClient

  init(sseClient: SSEClient) {
    self.sseClient = sseClient
  }

  func send(
    sessionId: String,
    message: String,
    draft: TeamsAssistantDraft
  ) -> AsyncThrowingStream<BuilderSSEEvent, Error> {
    let request = TeamsAssistantRequest(sessionId: sessionId, message: message, draft: draft)
    return sseClient.streamBuilder(request)
  }
}
