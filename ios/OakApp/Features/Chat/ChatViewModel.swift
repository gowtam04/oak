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
  /// pending chip pick, else the server-resolved scope, else the national-dex
  /// default — identical to web's
  /// `displayFormat = scopeSeed ?? resolvedScope ?? "national-dex"`.
  var displayFormat: Format {
    scopeSeed ?? resolvedScope ?? .nationalDex
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

  // MARK: Background-turns state (durable turn id + reattach; design §6.2)

  /// The server-minted id of the turn currently in flight (the `turn` SSE frame,
  /// BT-2). Mirrored into ``AppState/pendingTurns`` (which survives view teardown)
  /// so the thread can reattach after navigating away, backgrounding, or an app
  /// relaunch. `nil` when no turn is in flight; cleared on any terminal event, an
  /// explicit stop, or a resume 404.
  private(set) var currentTurnId: String?

  /// A stop was requested BEFORE the `turn` frame arrived (design §6.2 — the
  /// pre-`turn`-frame race). The read is kept alive solely to capture the incoming
  /// `turn_id`; the reducer then fires the stop endpoint with it and drops the
  /// connection. Cleared once handled, on a connection death before the frame, or on
  /// send/resume/detach. See ``pendingStopSessionId``.
  private var pendingStop = false

  /// The `sessionId` the turn being stopped was started under, captured when
  /// ``pendingStop`` is armed — a quick stop rotates `sessionId`, but a guest stop must
  /// still authorize against the ORIGINAL session, so the deferred stop uses this.
  private var pendingStopSessionId: String?

  /// The quick-stop window: a Stop tap within this of ``send()`` wipes the just-sent
  /// turn and restores its text (vs. a later stop, which keeps the answer-less turn).
  /// Mirrors web's `QUICK_STOP_MS` (2000ms).
  static let quickStopThreshold: TimeInterval = 2

  /// Max automatic reattach attempts after a mid-stream connection drop with a known
  /// `turn_id` (BT-7): a small budget heals a transient blip by re-subscribing to the
  /// still-running server turn (idempotent — no re-spend), then gives up to the manual
  /// Retry affordance. Reset whenever the app re-enters a thread (``reattachIfNeeded``)
  /// or real output resumes.
  private static let maxResumeAttempts = 2

  /// The brief backoff before a mid-stream reattach, so a flapping connection isn't
  /// hammered. Short enough that a real drop reconnects almost immediately.
  private static let resumeBackoff: Duration = .milliseconds(400)

  /// When the current turn's stream started (set on ``send()``), for the quick-stop
  /// window. `nil` when no turn is in flight.
  private var turnStartedAt: Date?

  /// True while a reattach is pending or in flight — the turn stays "in flight" and
  /// the status view shows "Reconnecting…" instead of a dead-end error. Cleared once
  /// output resumes, or on any terminal event.
  private(set) var reconnecting = false

  /// Auto reattach attempts spent on the current drop (bounded by ``maxResumeAttempts``).
  private var resumeAttempts = 0

  /// The active `beginBackgroundTask` assertion granting a short grace window so a
  /// short turn can finish streaming after the app backgrounds, instead of dropping
  /// immediately (design §6.2 SHOULD). `.invalid` when none is held.
  private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

  /// Whether backgrounding requests a `beginBackgroundTask` grace window. Production
  /// default; unit tests disable it so the reattach/detach logic is exercised without
  /// touching the real UIKit background-task machinery.
  private let usesBackgroundGrace: Bool

  init(chat: any ChatService, appState: AppState, usesBackgroundGrace: Bool = true) {
    self.chat = chat
    self.appState = appState
    self.usesBackgroundGrace = usesBackgroundGrace
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

    // Tear down any prior local stream before starting a new turn (local only — a
    // genuinely still-running server turn is caught by the POST's 409 and reattached).
    resetStreamState()

    turns.append(ChatTurnItem(content: .user(text: text, imageCount: images.count)))
    mirrorGuestTurn(GuestTurn(content: .user(text: text)))

    composerText = ""
    pendingImages = []
    // Stamp the quick-stop window for this fresh turn.
    turnStartedAt = Date()
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

  /// Re-opens the stream for the last turn after a recoverable failure or an
  /// interrupted (resume-404) turn, WITHOUT appending another user turn (the message
  /// is already in the thread). Prefers the retained ``lastRequest``; for a resumed
  /// thread with no retained request (an interrupted turn re-opened from history), it
  /// reconstructs a text-only request from the last user turn so manual Retry still
  /// works.
  func retry() {
    guard !isStreaming else { return }
    if let request = lastRequest {
      beginStreaming(request)
      return
    }
    // Resumed thread with no retained request: re-send the last user turn's text.
    if case let .user(text, _)? = turns.last?.content, !text.isEmpty {
      let request = PendingRequest(message: text, images: [], scopeSeed: scopeSeed)
      lastRequest = request
      beginStreaming(request)
    }
  }

  /// Handles the composer's Stop tap (design §6.2 — the Stop affordance). Explicitly
  /// stops the running turn **server-side** (`POST …/stop`, BT-4 — no longer implied
  /// by a disconnect) and then tears the local stream down. A user-initiated stop is
  /// NOT a failure, so no error banner is shown. A stop within ``quickStopThreshold``
  /// of ``send()`` is a "quick stop": the just-sent turn is discarded and its message
  /// (and staged images) restored into the composer for an easy redo. A later stop
  /// leaves the now-answerless user turn in the thread.
  ///
  /// WEB-PARITY NOTE: web's quick-stop wipes the ENTIRE thread and rotates the session
  /// (not merely the just-sent turn) while keeping the displayed scope — this mirrors
  /// that behaviour exactly.
  func stopStreaming() {
    performStop(now: Date())
  }

  /// The clock-injectable core of ``stopStreaming()`` — exposed (internal) so tests can
  /// drive the quick-stop vs. late-stop decision deterministically without waiting on
  /// the real ``quickStopThreshold``.
  func performStop(now: Date) {
    guard isStreaming else { return }
    let elapsed = now.timeIntervalSince(turnStartedAt ?? .distantPast)
    let stopped = lastRequest
    let turnId = currentTurnId ?? appState.pendingTurn(for: sessionId)

    // Pre-`turn`-frame stop race (design §6.2): the user stopped before the server sent
    // `turn { turn_id }`, so there is no id to POST to yet — but a stream attempt IS in
    // flight. Tearing down now would strand the server turn (it would persist a ghost
    // answer). Instead: mark a pending stop, finalize the UI immediately, and keep the
    // READ ALIVE solely to capture the `turn` frame — the reducer then fires the stop
    // endpoint with the captured id and drops the connection. Remember the session id
    // the turn was started under (quick-stop rotates `sessionId`) so a guest stop still
    // authorizes. If the connection dies before the frame, `consume` stays silently idle.
    if turnId == nil, streamTask != nil {
      pendingStop = true
      pendingStopSessionId = sessionId
      finalizeStopUI(elapsed: elapsed, request: stopped)  // keeps `streamTask` alive
      return
    }

    // Normal stop: the turn id is known (or nothing is really in flight). Stop the
    // running turn server-side (fire-and-forget; local teardown proceeds regardless of
    // the call's outcome), tear the local stream down (no banner), and drop the
    // pending-turn pointer so no reattach fires for a discarded turn.
    stopServerTurn()
    resetStreamState()
    clearPendingTurn()
    finalizeStopUI(elapsed: elapsed, request: stopped)
  }

  /// Applies the quick-stop-vs-late-stop UI decision, WITHOUT tearing the stream down
  /// (the caller owns whether the read stays alive — the pre-`turn`-frame race keeps it
  /// alive to capture the id). A quick stop (within ``quickStopThreshold`` of ``send()``)
  /// wipes the thread, rotates the session, and restores the composer for a redo; a late
  /// stop keeps the now-answerless user turn. A user stop is never a failure (no banner).
  private func finalizeStopUI(elapsed: TimeInterval, request: PendingRequest?) {
    isStreaming = false
    reconnecting = false
    endBackgroundGrace()
    setIdleTimerDisabled(false)

    guard elapsed < Self.quickStopThreshold, let request else {
      // Late stop: keep the answer-less user turn in the thread; nothing else to do.
      return
    }

    // Quick stop: wipe to a brand-new session and restore the message for a redo. Scope
    // is intentionally NOT reset (web keeps `resolvedScope`/`scopeSeed` on stop).
    turns = []
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    lastRequest = nil
    turnStartedAt = nil
    sessionId = UUID().uuidString
    appState.activeConversationId = nil
    if case .guest = appState.authState {
      appState.guestThread = []
    }
    composerText = request.message
    pendingImages = request.images
  }

  // MARK: Scene lifecycle (detach on background, reattach on foreground; design §6.2)

  /// The app entered the background (screen lock / app switch). If a turn is streaming,
  /// take a short `beginBackgroundTask` grace window so a nearly-finished turn can keep
  /// streaming to completion before iOS suspends us (design §6.2 SHOULD). The turn is
  /// NEVER cancelled — if the grace expires the socket simply drops (``detach``) and the
  /// still-running server turn is reattached on return.
  func sceneDidEnterBackground() {
    guard isStreaming else { return }
    beginBackgroundGrace()
  }

  /// The app returned to the foreground. Release any background-grace assertion and, if
  /// a turn is still generating for the visible thread but the socket has dropped,
  /// reattach to its live stream (design §6.2). A live stream reattaches to nothing.
  func sceneWillEnterForeground() {
    endBackgroundGrace()
    reattachIfNeeded()
  }

  /// Closes the live stream WITHOUT stopping the turn (design §6.2 — navigating away /
  /// backgrounding **unsubscribes**, it never cancels generation). Keeps the in-flight
  /// state and the pending-turn pointer so the thread reattaches when reopened. Used by
  /// the thread's `.onDisappear` and by the background-grace expiration. Never calls the
  /// server.
  func detach() {
    streamTask?.cancel()
    streamTask = nil
    clearPendingStop()  // abandon any deferred stop — a detach is not a stop (§6.2)
    endBackgroundGrace()
    setIdleTimerDisabled(false)
  }

  /// Reattaches to a still-generating turn's live stream when a thread is (re)shown or
  /// the app foregrounds (design §6.2). A no-op when a stream is already attached, or
  /// when no turn is pending for the visible conversation. On reattach the `turn` frame
  /// rebuilds the in-flight UI from the replay, then events apply exactly like a live
  /// stream.
  func reattachIfNeeded() {
    guard streamTask == nil else { return }  // already attached (live or resuming)
    guard let turnId = currentTurnId ?? appState.pendingTurn(for: sessionId) else { return }
    resumeAttempts = 0
    beginResume(turnId: turnId)
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
    resetStreamState()
    clearPendingTurn()
    turns = []
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    composerText = ""
    pendingImages = []
    lastRequest = nil
    sessionId = UUID().uuidString
    // A fresh thread has no resolved scope yet — the chip falls back to the
    // national-dex default until a turn resolves one (web `handleNewChat`).
    resolvedScope = nil
    resolvedScopeSource = nil
    scopeSeed = nil
    appState.activeConversationId = nil
    if case .guest = appState.authState {
      appState.guestThread = []
      appState.guestThreadScope = .nationalDex
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
  ///
  /// `activeTurnId` is the conversation's `active_turn` from `GET /api/conversations/:id`
  /// (design §5.4 / §6.2): when the server reports a turn still generating for this
  /// thread — e.g. after an app relaunch, when the device-local pending pointer is gone
  /// — the resumed thread records it and immediately reattaches to its live stream, so
  /// reopening a mid-generation conversation shows the answer continuing.
  func loadResumed(
    conversationId: String,
    format: Format,
    turns: [ChatTurn],
    activeTurnId: String? = nil
  ) {
    resetStreamState()
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
    currentTurnId = nil

    // If the server reports a turn still generating for this thread, record it and
    // reattach — prefer the freshly-fetched `active_turn` over any stale local pointer.
    if let activeTurnId {
      appState.setPendingTurn(conversationId: conversationId, turnId: activeTurnId)
    }
    reattachIfNeeded()
  }

  /// Local stream teardown: cancels the in-flight consumer, clears the transient
  /// streaming/reconnect flags, ends any background-grace assertion, and releases the
  /// idle-timer hold. Does NOT clear the pending-turn pointer (``clearPendingTurn``) —
  /// callers that discard the turn (``stopStreaming``/``startNewConversation``) clear
  /// it explicitly, while ``detach`` keeps it for reattach. A cancelled consumer never
  /// writes a banner.
  private func resetStreamState() {
    streamTask?.cancel()
    streamTask = nil
    isStreaming = false
    reconnecting = false
    resumeAttempts = 0
    clearPendingStop()
    endBackgroundGrace()
    setIdleTimerDisabled(false)
  }

  /// Clears the deferred pre-`turn`-frame stop state (design §6.2). Called on
  /// send/resume/detach and once a deferred stop has been handled.
  private func clearPendingStop() {
    pendingStop = false
    pendingStopSessionId = nil
  }

  /// Drops the pending-turn pointer (local `currentTurnId` + the durable
  /// ``AppState/pendingTurns`` entry) for the current conversation.
  private func clearPendingTurn() {
    appState.clearPendingTurn(conversationId: sessionId)
    currentTurnId = nil
  }

  // MARK: Reducer (one event at a time)

  /// Folds a single ``SSEEvent`` into the streaming state. Exposed (internal) so the
  /// transition rules are unit-testable directly, in addition to the end-to-end
  /// `send` path.
  func apply(_ event: SSEEvent) {
    // Any event means the stream is attached again → clear any "Reconnecting…" state
    // (mirrors web, where every event handler resets `reconnecting`). Real output
    // (anything past the leading `turn` frame) also refreshes the reattach budget.
    reconnecting = false
    if case .turn = event {} else { resumeAttempts = 0 }
    switch event {
    case let .turn(turnId):
      // A stop was requested before this id existed (the pre-`turn`-frame race): now we
      // have the id, so fire the stop endpoint against the ORIGINAL session and drop the
      // connection — without resurrecting the (already-finalized) UI.
      if pendingStop {
        pendingStop = false
        fireStop(turnId: turnId, sessionId: pendingStopSessionId ?? sessionId)
        pendingStopSessionId = nil
        detach()  // cancel the read; release grace/idle. Never calls the server itself.
        return
      }
      // The server-minted turn id (BT-2), first frame of both the POST and resume
      // streams. Record it as the conversation's pending turn (survives view teardown)
      // and, since a reattach replays from here, rebuild the in-flight UI from scratch:
      // clear the streamed buffer + tool history so the buffered events repopulate them
      // without duplication. On a fresh send these are already empty.
      currentTurnId = turnId
      appState.setPendingTurn(conversationId: sessionId, turnId: turnId)
      streamingText = ""
      toolActivities = []
      isStreaming = true

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
      // Mirror the FULL answer (not just its prose) so the guest→sign-in import is
      // non-lossy — reasoning/citations/inferences survive.
      mirrorGuestTurn(GuestTurn(content: .assistant(answer: answer)))
      streamingText = ""
      toolActivities = []
      isStreaming = false
      clearPendingTurn()  // terminal: the turn is done — drop its pending pointer
      endBackgroundGrace()
      setIdleTimerDisabled(false)

    case let .error(code, message, _):
      // Transport/API fault delivered in-band: surface a recoverable banner and do
      // not leave a half-rendered answer (M-AC-4.4). The user turn stays in place. An
      // in-band `error` frame is a real model/agent fault (not a connection drop), so
      // it is a genuine terminal — clear the pending turn; it is never reattached.
      errorBanner = ErrorBanner(message: Self.bannerMessage(code: code, fallback: message), isRetryable: true)
      streamingText = ""
      toolActivities = []
      isStreaming = false
      clearPendingTurn()
      endBackgroundGrace()
      setIdleTimerDisabled(false)

    case .stopped:
      // The turn was explicitly stopped (BT-4) — by our own Stop, or another
      // subscriber. It is terminal and nothing is persisted: discard the in-flight
      // state, drop the pending pointer, and show no banner (a stop is not a failure).
      // Any answer-less user turn stays in the thread (matching a late Stop).
      streamingText = ""
      toolActivities = []
      isStreaming = false
      clearPendingTurn()
      endBackgroundGrace()
      setIdleTimerDisabled(false)
    }
  }

  // MARK: Streaming internals

  private func beginStreaming(_ request: PendingRequest) {
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    isStreaming = true
    reconnecting = false
    resumeAttempts = 0
    clearPendingStop()
    // A fresh POST turn: the server mints a new id, delivered on the `turn` frame.
    currentTurnId = nil
    // Hold the screen-wake lock while a turn streams (web's Screen Wake Lock analog).
    setIdleTimerDisabled(true)

    let stream = chat.send(
      sessionId: sessionId,
      message: request.message,
      images: request.images,
      scopeSeed: request.scopeSeed
    )
    streamTask = Task { [weak self] in
      await self?.consume(stream, isResume: false)
    }
  }

  /// Reattaches to a running turn's live stream (design §6.2). Opens with the `turn`
  /// frame (which rebuilds the in-flight UI from the replay), then tails to the
  /// terminal event. Shows "Reconnecting…" until output arrives.
  private func beginResume(turnId: String) {
    errorBanner = nil
    isStreaming = true
    reconnecting = true
    clearPendingStop()
    setIdleTimerDisabled(true)

    let sessionId = self.sessionId
    let stream = chat.resumeStream(turnId: turnId, sessionId: sessionId)
    streamTask = Task { [weak self] in
      await self?.consume(stream, isResume: true)
    }
  }

  /// Consumes one attached stream — a fresh POST (`isResume == false`) or a reattach
  /// (`isResume == true`). A cancelled consumer exits silently (``detach``/new turn); a
  /// connection drop with a known turn id reattaches (bounded); a 409 `turn_in_progress`
  /// reattaches to the already-running turn; a resume 404 clears the pending turn and
  /// surfaces the interrupted/Retry affordance; every other fault becomes a banner.
  private func consume(_ stream: AsyncThrowingStream<SSEEvent, Error>, isResume: Bool) async {
    do {
      for try await event in stream {
        if Task.isCancelled { return }
        apply(event)
      }
    } catch is CancellationError {
      return
    } catch let error as OakError {
      if Task.isCancelled { return }
      // A deferred stop whose connection died before the `turn` frame arrived: there is
      // no id to stop, so stay silently idle — no banner, no reattach (design §6.2).
      if pendingStop { clearPendingStop(); return }
      // A send that clashes with an already-running turn (BT-5): reattach to it
      // instead of surfacing an error.
      if case let .turnInProgress(turnId) = error {
        handleTurnInProgress(turnId: turnId)
        return
      }
      // A resume whose turn is gone server-side (unknown/expired): clear the pending
      // pointer and offer a manual retry (design §6.2).
      if isResume, case .http(status: 404, _, _) = error {
        handleResumeNotFound()
        return
      }
      // A connection drop (`.transport`) reattaches to the still-running server turn;
      // every other OakError (rate limit, HTTP status, image rejection, decode) is a
      // clean fault — surface it, never reattach.
      if case .transport = error, attemptReattach() { return }
      applyStreamFailure(error)
      return
    } catch {
      if Task.isCancelled { return }
      if pendingStop { clearPendingStop(); return }  // died before the id — nothing to stop
      // An unexpected non-`OakError` throw is treated as a connection drop.
      if attemptReattach() { return }
      applyStreamFailure(OakError.transportFailure(error))
      return
    }
    // The stream ended without a terminal event and was not cancelled — a dropped
    // socket can return a clean EOF instead of throwing.
    if !Task.isCancelled {
      // A deferred stop whose connection ended before the `turn` frame: stay idle.
      if pendingStop { clearPendingStop(); return }
      // Reattach to the known turn; otherwise clear the working flag (defensive).
      if isStreaming {
        if attemptReattach() { return }
        isStreaming = false
        setIdleTimerDisabled(false)
      }
    }
  }

  /// Maps a thrown transport/HTTP fault to a recoverable banner (M-AC-4.4). Clears
  /// any partial answer; the user turn remains so the user can retry. The stream task
  /// is released (but the pending-turn pointer is NOT cleared for a transport drop —
  /// reopening the thread / foregrounding can still reattach to the running turn).
  private func applyStreamFailure(_ error: OakError) {
    Log.chat.error("chat stream failed")
    errorBanner = banner(for: error)
    streamingText = ""
    toolActivities = []
    isStreaming = false
    reconnecting = false
    streamTask = nil
    endBackgroundGrace()
    setIdleTimerDisabled(false)
  }

  // MARK: Reattach after a connection drop (design §6.2 — replaces whole-turn re-POST)

  /// Attempts to reattach to the still-running server turn after a mid-stream drop.
  /// Returns `true` if it took ownership (scheduled a reattach); `false` ⇒ the caller
  /// surfaces the error. Bounded by ``maxResumeAttempts`` and gated on a known turn id —
  /// with none, a drop is a plain failure. Idempotent: it re-subscribes (no re-spend).
  private func attemptReattach() -> Bool {
    guard let turnId = currentTurnId ?? appState.pendingTurn(for: sessionId) else { return false }
    guard resumeAttempts < Self.maxResumeAttempts else { return false }
    resumeAttempts += 1
    reconnecting = true
    isStreaming = true
    errorBanner = nil
    streamingText = ""  // clear any half-answer; the replay rebuilds it

    let turnSessionId = sessionId
    streamTask = Task { [weak self] in
      try? await Task.sleep(for: Self.resumeBackoff)
      guard let self, !Task.isCancelled else { return }
      let stream = self.chat.resumeStream(turnId: turnId, sessionId: turnSessionId)
      await self.consume(stream, isResume: true)
    }
    return true
  }

  /// A send collided with a turn already generating for this conversation (409
  /// `turn_in_progress`, BT-5). Adopt the returned turn id and reattach to its live
  /// stream instead of surfacing an error.
  private func handleTurnInProgress(turnId: String) {
    currentTurnId = turnId
    appState.setPendingTurn(conversationId: sessionId, turnId: turnId)
    resumeAttempts = 0
    beginResume(turnId: turnId)
  }

  /// A reattach found the turn gone server-side (resume 404). Clear the pending
  /// pointer and, since the thread's last message has no answer, surface the
  /// interrupted/Retry affordance (design §6.2) — the retryable banner's Retry
  /// re-sends the last user turn (``retry()``).
  private func handleResumeNotFound() {
    clearPendingTurn()
    streamTask = nil
    isStreaming = false
    reconnecting = false
    resumeAttempts = 0
    endBackgroundGrace()
    setIdleTimerDisabled(false)
    errorBanner = ErrorBanner(message: Self.interruptedMessage, isRetryable: true)
  }

  /// Stops the current turn server-side (fire-and-forget). A no-op with no turn in flight.
  private func stopServerTurn() {
    guard let turnId = currentTurnId ?? appState.pendingTurn(for: sessionId) else { return }
    fireStop(turnId: turnId, sessionId: sessionId)
  }

  /// Fires the stop endpoint for `turnId` (fire-and-forget). Captures the id + session
  /// so the detached task holds no reference to `self`.
  private func fireStop(turnId: String, sessionId: String) {
    let chat = self.chat
    Task { try? await chat.stop(turnId: turnId, sessionId: sessionId) }
  }

  // MARK: Background-task grace (design §6.2 SHOULD — finish short turns after backgrounding)

  /// Takes a `beginBackgroundTask` assertion (if enabled and none is held) so an active
  /// stream keeps running briefly after the app backgrounds. On expiration the socket
  /// is dropped (``detach``) — the server turn keeps running and is reattached on return.
  private func beginBackgroundGrace() {
    guard usesBackgroundGrace, backgroundTaskId == .invalid else { return }
    backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "oak.chat.turn") { [weak self] in
      // Runs on the main thread; the VM is main-actor isolated.
      MainActor.assumeIsolated { self?.detach() }
    }
  }

  /// Ends any held background-task assertion. Safe to call when none is held.
  private func endBackgroundGrace() {
    guard backgroundTaskId != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTaskId)
    backgroundTaskId = .invalid
  }

  /// Sets the screen-wake hold. Centralized so both the hold (turn start) and every
  /// release path (terminal answer/error, transport fault, stop, cancel) go through one
  /// place — the idle timer can never be left stuck on. `UIApplication` is main-actor
  /// isolated; this type is `@MainActor`, so the access is safe.
  private func setIdleTimerDisabled(_ disabled: Bool) {
    UIApplication.shared.isIdleTimerDisabled = disabled
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
  /// ran in (web imports `resolvedScope ?? "national-dex"`). A pending chip pick is
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
    case .turnInProgress:
      // Never reaches here — a 409 is handled by reattach before `applyStreamFailure`.
      // Mapped defensively to the generic banner to keep the switch exhaustive.
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
  /// Shown when a reattach finds the turn gone server-side (resume 404) — the
  /// response was interrupted and the retryable banner re-sends the last message.
  static let interruptedMessage = "That response was interrupted. Tap Retry to ask again."

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
