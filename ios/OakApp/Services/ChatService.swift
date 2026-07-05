import Foundation
import UIKit

/// One chat turn → a live `SSEEvent` stream (component-design.md "Services layer";
/// chat-experience.md M-CHAT-US-1/4). View models depend on this **protocol**
/// (never `LiveChatService`) so they unit-test against `FakeChatService`.
///
/// The method is **synchronous** and returns an `AsyncThrowingStream<SSEEvent, Error>`
/// immediately: it runs in the caller's context (so passing the main-actor-held
/// `[UIImage]` is safe — there is no actor hop), then hands back the stream the
/// view-model's reducer consumes. Pre-stream HTTP failures (rate limit, 413, 503…)
/// surface as a thrown `OakError` from the stream before any event is yielded; an
/// in-band SSE `error` event (transport fault) arrives as `.error(...)`. Every
/// in-domain failure rides a normal `.answer` event whose `OakAnswer.status` carries
/// the failure — never the `error` channel (sse-types.ts).
protocol ChatService: Sendable {
  /// Opens the chat stream for one turn.
  ///
  /// - `sessionId`: the client thread UUID (equals the conversation id on resume).
  /// - `message`: 0–2000 chars; MAY be empty when `images` are attached.
  /// - `images`: attached photos (≤4), encoded to raw base64 with the client-side
  ///   caps enforced by `ImageEncoder`. A cap/type violation finishes the returned
  ///   stream by throwing `OakError.imageRejected(...)` before any event is yielded.
  /// - `scopeSeed`: an explicit scope pick from the header chip, sent as
  ///   `scope_seed`; `nil` ⇒ no pick (server precedence resolves the scope). Scope
  ///   is otherwise server-controlled — the model never sees it as a tool input.
  ///
  /// Saved teams are referenced **by name in chat** (resolved server-side via
  /// `list_teams` / `get_team`), so the body carries no team id.
  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?
  ) -> AsyncThrowingStream<SSEEvent, Error>

  /// Reattaches to a durable turn's live stream (`GET /api/chat/turns/:id/stream`,
  /// background-turns/design.md §6.2). Yields the SAME `SSEEvent` sequence a fresh
  /// `send` would — opening with the `turn` frame, replaying the buffered events,
  /// then tailing live to the terminal `answer`/`error`/`stopped`. Used when a
  /// thread is reopened (or the app foregrounded) with a turn still generating, and
  /// to heal a mid-stream connection drop for a known `turnId`.
  ///
  /// - `turnId`: the server-minted id captured from the `turn` frame (or the
  ///   conversation's `active_turn`).
  /// - `sessionId`: the client thread UUID, sent as `?session_id=` for guest
  ///   ownership (ignored for a signed-in caller, whose Bearer identifies them).
  ///
  /// A 404 (unknown/expired turn) is thrown as `OakError.http(status: 404, …)`
  /// before any event is yielded — the caller clears the pending turn and offers a
  /// manual retry.
  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error>

  /// Explicitly stops a running turn (`POST /api/chat/turns/:id/stop`,
  /// background-turns/design.md §6.2 / BT-4). The turn is discarded server-side
  /// (nothing persisted) and subscribers receive a terminal `stopped` event. Used
  /// by the composer's Stop affordance. Stopping an already-terminal turn is a
  /// no-op; the caller tears down its local stream regardless of the result.
  func stop(turnId: String, sessionId: String) async throws
}

/// Production ``ChatService`` over ``SSEClient`` (which borrows ``OakAPIClient`` for
/// the Bearer header + base URL). A value type holding one immutable struct, so it
/// is `Sendable` without ceremony.
struct LiveChatService: ChatService {
  private let sseClient: SSEClient

  init(sseClient: SSEClient) {
    self.sseClient = sseClient
  }

  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?
  ) -> AsyncThrowingStream<SSEEvent, Error> {
    // Encode + validate the attached images BEFORE opening the stream (M-AC-5.5).
    // `encode` is synchronous and runs in the caller's context (the main actor),
    // so passing the main-actor-held `[UIImage]` involves no actor hop. A client
    // cap/type violation surfaces as a thrown `OakError.imageRejected(...)` from
    // the returned stream — never as a partially-attached turn.
    let encodedImages: [ChatImage]
    do {
      encodedImages = try ImageEncoder().encode(images)
    } catch let error as OakError {
      return AsyncThrowingStream { $0.finish(throwing: error) }
    } catch {
      // `encode` only throws `OakError`; map any unexpected error to a Sendable
      // `OakError` BEFORE the `@Sendable` stream closure captures it.
      let mapped = OakError.transportFailure(error)
      return AsyncThrowingStream { $0.finish(throwing: mapped) }
    }

    let request = ChatRequest(
      sessionId: sessionId,
      message: message,
      images: encodedImages.isEmpty ? nil : encodedImages,
      scopeSeed: scopeSeed
    )
    return sseClient.stream(request)
  }

  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error> {
    sseClient.resume(turnId: turnId, sessionId: sessionId)
  }

  func stop(turnId: String, sessionId: String) async throws {
    try await sseClient.stop(turnId: turnId, sessionId: sessionId)
  }
}
