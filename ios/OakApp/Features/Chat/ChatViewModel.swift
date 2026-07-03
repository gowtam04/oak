import Foundation
import Observation
import UIKit

/// The chat thread's view model — the **SSE reducer** at the heart of the chat
/// experience (chat-experience.md M-CHAT-US-1/2/3/4; component-design.md "Streaming
/// reducer"). It holds the visible turns, the in-progress streaming state
/// (tool-activity items + a streamed-text buffer), the composer state (text +
/// images), and the turn's game scope (the server-resolved scope + a pending chip
/// pick), and folds the `SSEEvent` stream into UI state one event at a time.
///
/// `@MainActor @Observable` — all state mutates on the main actor and views observe
/// it directly. It depends on the ``ChatService`` **protocol** (never
/// `LiveChatService`) so it unit-tests against `FakeChatService`.
///
/// Reducer contract (sse-types.ts): `tool_activity`* → `answer_start`*/`answer_delta`*
/// → exactly one terminal `answer` (authoritative). On `answer_start` the
/// streamed-text buffer is cleared (the validate-and-re-emit reset) but the
/// tool-activity history is kept; `answer_delta` appends; the terminal `answer`
/// replaces the buffer with the authoritative ``OakAnswer`` and stops. Grok delivers
/// the whole answer in a SINGLE delta, so the reducer must not assume many. An
/// `error` event (or a thrown transport fault) becomes a recoverable banner and
/// never leaves a half-rendered answer (M-AC-4.4). In-domain failures (a non-
/// `answered` status) are rendered as normal answers, never errors (M-AC-1.3).
@MainActor
@Observable
final class ChatViewModel {

  // MARK: Thread + streaming state

  /// The committed, visible turns (user messages and finalized answers).
  private(set) var turns: [ChatTurnItem] = []

  /// The in-flight answer markdown, streamed token-by-token between `answer_start`
  /// and the terminal `answer` (M-AC-4.1). Empty when no answer prose is streaming.
  private(set) var streamingText: String = ""

  /// Tool-activity items for the current in-flight turn, newest last (M-AC-4.2).
  /// Kept across `answer_start`; cleared once the turn finalizes.
  private(set) var toolActivities: [ToolActivity] = []

  /// `true` from send until the terminal answer / error (M-AC-4.3 — the clear
  /// "working vs done" signal). Disables the composer's send while a turn streams.
  private(set) var isStreaming: Bool = false

  /// A recoverable error surfaced as a banner (transport drop, rate limit, an SSE
  /// `error` event). `nil` when clear. Never thrown — chat failures are UI state.
  private(set) var errorBanner: ErrorBanner?

  // MARK: Composer state

  /// Max images attachable to one turn — the backend's `MAX_IMAGES` cap (M-AC-5.2).
  /// The composer prevents exceeding it with a clear message.
  static let maxAttachedImages = 4

  /// The composer's text (two-way bound). 0–2000 chars; the server enforces the cap.
  var composerText: String = ""

  /// Photos staged for the next turn (M-AC-5.1/5.3). Populated by the composer's
  /// camera / photo-library attach UI (P8) through ``attachImages(_:)`` /
  /// ``removeImage(at:)``; encoded to the wire by `ImageEncoder` at send. Counted by
  /// the reducer for the user bubble and the image-only send rule (M-AC-5.4).
  private(set) var pendingImages: [UIImage] = []

  // MARK: Scope state (generation-scope GS-C)

  /// The scope the server resolved for the latest turn (the `scope` SSE event's
  /// `format`). `nil` on a fresh thread and until the first `scope` frame lands.
  /// Mirrors web's `resolvedScope` (`web/src/app/page.tsx`).
  private(set) var resolvedScope: Format?

  /// How the latest turn's scope was resolved (informational; the chip displays
  /// `displayFormat`, not this). `nil` until the first `scope` frame lands.
  private(set) var resolvedScopeSource: ScopeSource?

  /// An explicit scope pick from the header chip, sent as `scope_seed` on the NEXT
  /// turn only and cleared once ANY `scope` event lands — by then the server has a
  /// sticky scope that outranks a stale seed (`scope_seed` > sticky). Mirrors web's
  /// `scopeSeed` (`web/src/app/page.tsx`).
  private(set) var scopeSeed: Format?

  /// The scope the header chip displays and the artifact viewer scopes to: a
  /// pending chip pick, else the server-resolved scope, else the champions default
  /// — identical to web's `displayFormat = scopeSeed ?? resolvedScope ?? "champions"`.
  var displayFormat: Format {
    scopeSeed ?? resolvedScope ?? .champions
  }

  // MARK: Dependencies + identity

  private let chat: any ChatService
  private let appState: AppState

  /// The client thread id sent as `session_id` (equals the conversation id on
  /// resume). Rotated by ``startNewConversation()`` so a new thread has no prior
  /// context (M-AC-3.1).
  private(set) var sessionId: String

  /// The in-flight stream consumer; cancelled on a new turn or view disappear.
  private(set) var streamTask: Task<Void, Never>?

  /// The last turn's request, kept so ``retry()`` can re-open the stream after a
  /// recoverable failure without re-appending the user turn (M-AC-4.4).
  private var lastRequest: PendingRequest?

  init(chat: any ChatService, appState: AppState) {
    self.chat = chat
    self.appState = appState
    self.sessionId = appState.activeConversationId ?? UUID().uuidString
  }

  // MARK: Derived state

  /// Whether the composer can send: not already streaming, and either some text or
  /// at least one attached image (an image-only turn is valid, M-AC-5.4).
  var canSend: Bool {
    guard !isStreaming else { return false }
    let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
    return !trimmed.isEmpty || !pendingImages.isEmpty
  }

  /// The coarse in-progress phase, for the streaming status view (M-AC-4.3).
  var streamingPhase: StreamingPhase {
    guard isStreaming else { return .idle }
    if !streamingText.isEmpty { return .answering }
    if !toolActivities.isEmpty { return .usingTools }
    return .thinking
  }

  // MARK: Composer actions

  /// Sends the composed turn: appends the user message immediately (M-AC-1.1),
  /// resets the streaming state, and starts consuming the event stream. A no-op when
  /// nothing can be sent.
  func send() {
    guard canSend else { return }
    let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
    let images = pendingImages

    // Tear down any prior stream before starting a new turn.
    cancelStreaming()

    turns.append(ChatTurnItem(content: .user(text: text, imageCount: images.count)))
    mirrorGuestTurn(GuestTurn(role: .user, text: text))

    composerText = ""
    pendingImages = []
    // The pending chip pick (if any) rides THIS turn as `scope_seed`; a `scope`
    // event will clear `scopeSeed` mid-turn so it doesn't leak onto the next turn.
    let request = PendingRequest(
      message: text,
      images: images,
      scopeSeed: scopeSeed
    )
    lastRequest = request
    beginStreaming(request)
  }

  /// Re-opens the stream for the last turn after a recoverable failure, WITHOUT
  /// appending another user turn (the message is already in the thread).
  func retry() {
    guard !isStreaming, let request = lastRequest else { return }
    beginStreaming(request)
  }

  /// Records an explicit scope pick from the header chip (GS-C). It seeds the NEXT
  /// turn as `scope_seed` and immediately updates `displayFormat` (a pending seed
  /// outranks the resolved scope), so the chip reflects the pick before the turn
  /// runs. Ignored mid-stream so a turn's scope is stable — the chip is disabled
  /// then in the UI. Mirrors web's `setScopeSeed` (`web/src/app/page.tsx`).
  func selectScope(_ format: Format) {
    guard !isStreaming else { return }
    scopeSeed = format
  }

  /// Stages images for the next turn, capped at ``maxAttachedImages`` (the backend's
  /// `MAX_IMAGES`, M-AC-5.2). Returns the number actually added so the composer can
  /// tell the user when some were dropped because the cap was reached. Extra images
  /// beyond the cap are ignored rather than rejecting the whole batch.
  @discardableResult
  func attachImages(_ images: [UIImage]) -> Int {
    let remaining = Self.maxAttachedImages - pendingImages.count
    guard remaining > 0, !images.isEmpty else { return 0 }
    let toAdd = Array(images.prefix(remaining))
    pendingImages.append(contentsOf: toAdd)
    return toAdd.count
  }

  /// Removes a staged image (the composer's per-thumbnail remove, M-AC-5.3). A no-op
  /// for an out-of-range index.
  func removeImage(at index: Int) {
    guard pendingImages.indices.contains(index) else { return }
    pendingImages.remove(at: index)
  }

  // MARK: Conversation lifecycle

  /// Starts a fresh conversation: tears down any stream, clears the thread, and
  /// rotates the session id so the agent has no prior context (M-CHAT-US-3). Clears
  /// the in-memory guest thread for guests.
  func startNewConversation() {
    cancelStreaming()
    turns = []
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    composerText = ""
    pendingImages = []
    lastRequest = nil
    sessionId = UUID().uuidString
    // A fresh thread has no resolved scope yet — the chip falls back to the
    // champions default until a turn resolves one (web `handleNewChat`).
    resolvedScope = nil
    resolvedScopeSource = nil
    scopeSeed = nil
    appState.activeConversationId = nil
    if case .guest = appState.authState {
      appState.guestThread = []
      appState.guestThreadScope = .champions
    }
  }

  /// Seeds the thread from a resumed conversation's rehydrated turns and binds the
  /// session to its id (M-AC-H3.1/M-AC-H3.2), so the earlier answers re-render
  /// through the normal answer-card tree and follow-ups continue the saved thread
  /// under the same `session_id`. The mapped user turns carry no image count (the
  /// rehydrated wire turn keeps only its text, not the original attachments).
  ///
  /// `format` is the conversation's stored scope: it seeds `resolvedScope` so the
  /// header chip + artifact viewer reflect the saved scope immediately, before the
  /// first resumed turn re-emits a `scope` event (web `handleOpenConversation`).
  func loadResumed(conversationId: String, format: Format, turns: [ChatTurn]) {
    cancelStreaming()
    sessionId = conversationId
    self.turns = turns.map { turn in
      switch turn {
      case let .user(_, content):
        return ChatTurnItem(content: .user(text: content, imageCount: 0))
      case let .assistant(_, answer):
        return ChatTurnItem(content: .assistant(answer))
      }
    }
    resolvedScope = format
    resolvedScopeSource = nil
    scopeSeed = nil
    streamingText = ""
    toolActivities = []
    errorBanner = nil
  }

  /// Cancels the in-flight stream (a new turn, or the view disappearing). Leaves the
  /// thread intact; a cancelled consumer never writes a banner.
  func cancelStreaming() {
    streamTask?.cancel()
    streamTask = nil
    isStreaming = false
  }

  // MARK: Reducer (one event at a time)

  /// Folds a single ``SSEEvent`` into the streaming state. Exposed (internal) so the
  /// transition rules are unit-testable directly, in addition to the end-to-end
  /// `send` path.
  func apply(_ event: SSEEvent) {
    switch event {
    case let .scope(format, source):
      // The server resolved this turn's scope. Adopt it and retire any pending
      // chip pick — the conversation's scope is now sticky server-side and
      // outranks a stale seed on the following turn (web clears `scopeSeed` here).
      resolvedScope = format
      resolvedScopeSource = source
      scopeSeed = nil
      mirrorGuestScope(format)

    case let .toolActivity(tool, label):
      toolActivities.append(ToolActivity(tool: tool, label: label))

    case .answerStart:
      // Re-emit reset: clear the streamed-text buffer, KEEP the tool-activity
      // history (a fresh submit_answer is beginning to stream).
      streamingText = ""

    case let .answerDelta(text):
      streamingText += text

    case let .answer(answer):
      // The terminal, authoritative answer replaces any streamed buffer and ends
      // the turn. A non-`answered` status is rendered as a normal answer (M-AC-1.3).
      turns.append(ChatTurnItem(content: .assistant(answer)))
      mirrorGuestTurn(GuestTurn(role: .assistant, text: answer.answerMarkdown))
      streamingText = ""
      toolActivities = []
      isStreaming = false

    case let .error(code, message, _):
      // Transport/API fault delivered in-band: surface a recoverable banner and do
      // not leave a half-rendered answer (M-AC-4.4). The user turn stays in place.
      errorBanner = ErrorBanner(message: Self.bannerMessage(code: code, fallback: message), isRetryable: true)
      streamingText = ""
      toolActivities = []
      isStreaming = false
    }
  }

  // MARK: Streaming internals

  private func beginStreaming(_ request: PendingRequest) {
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    isStreaming = true

    let stream = chat.send(
      sessionId: sessionId,
      message: request.message,
      images: request.images,
      scopeSeed: request.scopeSeed
    )
    streamTask = Task { [weak self] in
      await self?.consume(stream)
    }
  }

  private func consume(_ stream: AsyncThrowingStream<SSEEvent, Error>) async {
    do {
      for try await event in stream {
        if Task.isCancelled { return }
        apply(event)
      }
    } catch is CancellationError {
      return
    } catch let error as OakError {
      if Task.isCancelled { return }
      applyStreamFailure(error)
      return
    } catch {
      if Task.isCancelled { return }
      applyStreamFailure(OakError.transportFailure(error))
      return
    }
    // Defensive: the stream finished without a terminal answer/error and was not
    // cancelled. Clear the in-progress flag so the UI doesn't hang in "working".
    if !Task.isCancelled, isStreaming {
      isStreaming = false
    }
  }

  /// Maps a thrown transport/HTTP fault to a recoverable banner (M-AC-4.4). Clears
  /// any partial answer; the user turn remains so the user can retry.
  private func applyStreamFailure(_ error: OakError) {
    Log.chat.error("chat stream failed")
    errorBanner = banner(for: error)
    streamingText = ""
    toolActivities = []
    isStreaming = false
  }

  /// Mirrors a completed turn into the in-memory guest thread (guests only) so the
  /// guest→sign-in import (P9) has the turns. Signed-in turns are persisted
  /// server-side, so no client mirror is needed.
  private func mirrorGuestTurn(_ turn: GuestTurn) {
    guard case .guest = appState.authState else { return }
    appState.guestThread.append(turn)
  }

  /// Mirrors the latest turn's RESOLVED scope onto the guest thread (guests only),
  /// so the guest→sign-in import can upload the thread under the scope it actually
  /// ran in (web imports `resolvedScope ?? "champions"`). A pending chip pick is
  /// intentionally NOT mirrored — no turn has run under it yet.
  private func mirrorGuestScope(_ format: Format) {
    guard case .guest = appState.authState else { return }
    appState.guestThreadScope = format
  }

  // MARK: Error copy (instance for the guest hint; statics for assertable strings)

  /// Maps an ``OakError`` to a banner. Rate-limited guests get the "sign in raises
  /// the limit" hint (api-design.md "Error Handling").
  private func banner(for error: OakError) -> ErrorBanner {
    switch error {
    case .transport:
      return ErrorBanner(message: Self.connectionMessage, isRetryable: true)
    case let .rateLimited(retryAfter):
      var message = Self.rateLimitMessage(retryAfter: retryAfter)
      if case .guest = appState.authState {
        message += " Sign in to raise the limit."
      }
      return ErrorBanner(message: message, isRetryable: true)
    case .unauthorized:
      return ErrorBanner(message: Self.sessionExpiredMessage, isRetryable: false)
    case let .http(_, _, message):
      return ErrorBanner(message: message.isEmpty ? Self.genericMessage : message, isRetryable: true)
    case let .imageRejected(reason):
      // Surface the ACTUAL reason (too large / unsupported / too many) rather than
      // the dead-end generic banner, so a rejected attachment is self-explanatory
      // and instantly distinguishable from a server/transport fault.
      return ErrorBanner(message: Self.imageRejectedMessage(reason), isRetryable: true)
    case .decoding:
      return ErrorBanner(message: Self.genericMessage, isRetryable: true)
    }
  }

  /// User-facing copy for a client-side image rejection (``ImageRejectReason``). The
  /// encoder downscales attachments to fit the caps, so `.perImageTooLarge` /
  /// `.totalTooLarge` are now rare — but when one does fire the user learns why.
  static func imageRejectedMessage(_ reason: ImageRejectReason) -> String {
    switch reason {
    case .tooMany:
      return "You can attach up to \(ChatViewModel.maxAttachedImages) images."
    case .perImageTooLarge:
      return "That image is too large to send. Try a smaller one."
    case .totalTooLarge:
      return "Those images are too large together. Remove one and try again."
    case .unsupportedType:
      return "That image couldn't be processed. Try a different one."
    }
  }

  /// Maps an in-band SSE `error` event to user-facing copy, falling back to the
  /// server-provided message.
  static func bannerMessage(code: String, fallback: String) -> String {
    switch code {
    case "model_unavailable":
      return "Oak is temporarily unavailable. Please try again in a moment."
    default:
      return fallback.isEmpty ? genericMessage : fallback
    }
  }

  static let connectionMessage = "No connection. Check your network and try again."
  static let sessionExpiredMessage = "Your session expired. Please sign in again."
  static let genericMessage = "Something went wrong. Please try again."

  static func rateLimitMessage(retryAfter: TimeInterval?) -> String {
    if let seconds = retryAfter, seconds > 0 {
      let whole = Int(seconds.rounded(.up))
      return "You're sending messages too quickly. Please wait \(whole)s and try again."
    }
    return "You're sending messages too quickly. Please wait a moment and try again."
  }
}

// MARK: - Supporting value types

extension ChatViewModel {
  /// One rendered entry in the chat thread: a user message or a finalized answer.
  struct ChatTurnItem: Identifiable, Sendable, Equatable {
    enum Content: Sendable, Equatable {
      /// A user message. `imageCount` drives the "N image(s) attached" caption.
      case user(text: String, imageCount: Int)
      /// A finalized, authoritative answer rendered through the answer view.
      case assistant(OakAnswer)
    }

    let id: UUID
    let content: Content

    init(id: UUID = UUID(), content: Content) {
      self.id = id
      self.content = content
    }
  }

  /// One live tool-activity item (`tool_activity` event), shown while the loop runs.
  struct ToolActivity: Identifiable, Sendable, Equatable {
    let id: UUID
    let tool: String
    let label: String

    init(id: UUID = UUID(), tool: String, label: String) {
      self.id = id
      self.tool = tool
      self.label = label
    }
  }

  /// The coarse in-progress phase used by the streaming status view.
  enum StreamingPhase: Sendable, Equatable {
    /// Nothing streaming.
    case idle
    /// Sent; the agent is reasoning before any tool call or prose.
    case thinking
    /// One or more tools are running (no answer prose yet).
    case usingTools
    /// Answer prose is streaming.
    case answering
  }

  /// A recoverable error rendered as a banner above the composer.
  struct ErrorBanner: Sendable, Equatable {
    let message: String
    let isRetryable: Bool
  }

  /// The parameters of a turn, retained for ``retry()``. Held only on the main
  /// actor (it carries non-`Sendable` `UIImage`s).
  fileprivate struct PendingRequest {
    let message: String
    let images: [UIImage]
    let scopeSeed: Format?
  }
}
