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
  /// pending chip pick, else the server-resolved scope, else the signed-in
  /// last-used preference, else the national-dex default — identical to web's
  /// `displayFormat = scopeSeed ?? resolvedScope ?? lastUsedScope ?? "national-dex"`.
  var displayFormat: Format {
    scopeSeed ?? resolvedScope ?? appState.lastUsedScope ?? .nationalDex
  }

  /// Mention tokens inserted via `@` autocomplete (MEN-US-1).
  private(set) var mentionTokens: [FollowUpChips.MentionedTeam] = []

  /// Teams matching the in-progress `@` query (empty when not mentioning).
  private(set) var mentionSuggestions: [TeamSummary] = []

  /// Mention ids that failed to bind (deleted / not owned). Blocks send.
  private(set) var deadMentionIds: Set<String> = []

  /// Note when retry/edit cannot re-attach consume-on-turn images (REC-BR-7).
  private(set) var missingImagesNote: String?

  /// Last send's bound team, for the follow-up team chip.
  private(set) var lastMentionedTeam: FollowUpChips.MentionedTeam?

  /// Saved-team list for mention autocomplete (signed-in only).
  private var savedTeams: [TeamSummary] = []

  /// Empty-desk recents (signed-in returning users).
  private(set) var recentConversation: ConversationSummary?
  private(set) var recentTeam: TeamSummary?

  /// Per-turn pins for the open conversation (assistant message ids, thread order).
  private(set) var pinnedMessageIds: [String] = []

  /// `true` after ``beginEditLast()`` until the edited send finishes or is cancelled.
  private(set) var isEditingLast = false

  // MARK: Dependencies + identity

  private let chat: any ChatService
  private let appState: AppState
  private let history: (any HistoryService)?
  private let teams: (any TeamService)?
  private let shares: (any ShareService)?

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

  /// The undo window: an Undo tap within this of ``send()`` stops the turn and
  /// restores composer state (ADR-3 / REC-US-3). After this, Stop remains.
  static let quickStopThreshold: TimeInterval = 3

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
  /// window and the thinking-trace elapsed clock. `nil` when no turn is in flight.
  private var turnStartedAt: Date?

  /// Public start time for the in-flight thinking trace. `nil` when idle.
  var streamStartedAt: Date? { turnStartedAt }

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

  init(
    chat: any ChatService,
    appState: AppState,
    history: (any HistoryService)? = nil,
    teams: (any TeamService)? = nil,
    shares: (any ShareService)? = nil,
    usesBackgroundGrace: Bool = true
  ) {
    self.chat = chat
    self.appState = appState
    self.history = history
    self.teams = teams
    self.shares = shares
    self.usesBackgroundGrace = usesBackgroundGrace
    self.sessionId = appState.activeConversationId ?? UUID().uuidString
  }

  // MARK: Derived state

  /// Whether the composer can send: not already streaming (unless editing, which
  /// stops first), no dead mentions, and either some text or an attached image.
  var canSend: Bool {
    if isStreaming && !isEditingLast { return false }
    guard deadMentionIds.isEmpty else { return false }
    let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
    return !trimmed.isEmpty || !pendingImages.isEmpty
  }

  var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  /// Undo is offered on the just-sent user bubble for ~3s while the turn streams.
  var canUndoSend: Bool {
    guard isStreaming, let started = turnStartedAt else { return false }
    return Date().timeIntervalSince(started) < Self.quickStopThreshold
  }

  /// Retry is last-assistant-card only, and hidden while a turn is in flight.
  var canRetryLastAnswer: Bool {
    guard !isStreaming else { return false }
    if case .assistant = turns.last?.content { return true }
    return false
  }

  /// Edit is last-user-message only (the last *user* id, not the last row).
  var canEditLastUser: Bool {
    lastUserTurn() != nil
  }

  /// The last user turn's local id, even when an assistant card follows it.
  var lastUserTurnId: UUID? {
    lastUserIndex().map { turns[$0].id }
  }

  /// The last assistant turn's local id (retry is last-assistant-card only).
  var lastAssistantTurnId: UUID? {
    lastAssistantIndex().map { turns[$0].id }
  }

  func isLastUser(_ turn: ChatTurnItem) -> Bool {
    lastUserTurnId == turn.id
  }

  func isLastAssistant(_ turn: ChatTurnItem) -> Bool {
    lastAssistantTurnId == turn.id
  }

  /// The coarse in-progress phase, for the streaming status view (M-AC-4.3).
  var streamingPhase: StreamingPhase {
    guard isStreaming else { return .idle }
    if !streamingText.isEmpty { return .answering }
    if !toolActivities.isEmpty { return .usingTools }
    return .thinking
  }

  // MARK: Composer actions

  /// Sends the composed turn: intercepts known slashes, binds `@` mentions,
  /// appends the user message (unless this is an edit recovery), and starts
  /// the event stream.
  func send() {
    guard canSend else { return }
    let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)

    // Handled slashes are not a chat turn — skip them while editing the last
    // user message so "/new" in an edited typo still recovery-POSTs.
    if !isEditingLast {
      switch SlashCommands.parse(text, hasUsagePage: false) {
      case .navigate(let target):
        handleSlash(target, argument: SlashCommands.argument(text))
        composerText = ""
        return
      case .message:
        break
      }
    }

    let mentions = resolveMentions(in: text)
    if !deadMentionIds.isEmpty { return }

    let images = pendingImages
    let recovery: ChatRecovery? = isEditingLast ? .edit : nil

    if isStreaming, isEditingLast {
      performStop(now: Date())
    }

    resetStreamState()

    if recovery == nil {
      turns.append(ChatTurnItem(content: .user(text: text, imageCount: images.count)))
      mirrorGuestTurn(GuestTurn(content: .user(text: text)))
    }

    composerText = ""
    pendingImages = []
    isEditingLast = false
    missingImagesNote = nil
    lastMentionedTeam = mentions.first
    turnStartedAt = Date()
    let request = PendingRequest(
      message: text,
      images: images,
      scopeSeed: scopeSeed,
      recovery: recovery,
      mentionedTeamIds: mentions.map(\.id)
    )
    lastRequest = request
    beginStreaming(request)
  }

  /// Retry the last completed assistant answer (REC-US-1). Keeps the previous
  /// pair on screen until the new answer succeeds.
  func retryLastAnswer() {
    guard canRetryLastAnswer else { return }
    guard let user = lastUserTurn() else { return }
    let images = lastRequest?.images ?? []
    if user.imageCount > 0, images.isEmpty {
      missingImagesNote = "The pictures from that message are no longer attached."
    }
    resetStreamState()
    turnStartedAt = Date()
    let request = PendingRequest(
      message: user.text,
      images: images,
      scopeSeed: lastRequest?.scopeSeed ?? scopeSeed,
      recovery: .retry,
      mentionedTeamIds: lastRequest?.mentionedTeamIds
    )
    lastRequest = request
    beginStreaming(request)
  }

  /// Load the last user message into the composer for editing (REC-US-2).
  /// Restores still-in-memory ``lastRequest`` images onto the composer.
  func beginEditLast() {
    guard let user = lastUserTurn() else { return }
    composerText = user.text
    isEditingLast = true
    if let images = lastRequest?.images, !images.isEmpty {
      pendingImages = images
      missingImagesNote = nil
    } else if user.imageCount > 0 {
      missingImagesNote = "The pictures from that message are no longer attached."
    }
  }

  /// Undo the just-sent turn: existing Stop + restore composer (ADR-3).
  func undoSend() {
    performStop(now: Date())
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

  /// Applies the undo-vs-late-stop UI decision, WITHOUT tearing the stream down
  /// (the caller owns whether the read stays alive — the pre-`turn`-frame race keeps it
  /// alive to capture the id). Undo (within ``quickStopThreshold``) restores the
  /// composer and removes the just-sent user bubble; a late stop keeps the
  /// answer-less user turn. A user stop is never a failure (no banner).
  private func finalizeStopUI(elapsed: TimeInterval, request: PendingRequest?) {
    isStreaming = false
    reconnecting = false
    endBackgroundGrace()
    setIdleTimerDisabled(false)

    guard elapsed < Self.quickStopThreshold, let request else {
      return
    }

    if request.recovery == nil, case .user = turns.last?.content {
      turns.removeLast()
      if case .guest = appState.authState, let last = appState.guestThread.last, last.role == .user {
        appState.guestThread.removeLast()
      }
    }
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    turnStartedAt = nil
    composerText = request.message
    pendingImages = request.images
    if request.recovery == .edit {
      isEditingLast = true
    }
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
    if case .signedIn = appState.authState {
      appState.lastUsedScope = format
    }
    Task { await persistScopePick(format) }
  }

  /// Persist a chip pick with no follow-up message (SCOPE-US-1).
  private func persistScopePick(_ format: Format) async {
    do {
      let conversationId = appState.activeConversationId
      let scopes = try await chat.persistScope(
        format: format,
        conversationId: conversationId,
        sessionId: sessionId
      )
      if !scopes.isEmpty {
        appState.lastUsedScopes = scopes
      } else {
        touchLocalMRU(format)
      }
    } catch {
      touchLocalMRU(format)
    }
  }

  private func touchLocalMRU(_ format: Format) {
    guard isSignedIn else { return }
    var next = appState.lastUsedScopes.filter { $0 != format }
    next.insert(format, at: 0)
    appState.lastUsedScopes = next
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
    mentionTokens = []
    mentionSuggestions = []
    deadMentionIds = []
    isEditingLast = false
    missingImagesNote = nil
    pinnedMessageIds = []
    sessionId = UUID().uuidString
    // A fresh thread has no resolved scope yet — the chip falls through to
    // lastUsedScope (signed-in preference) or national-dex (web `handleNewChat`).
    // lastUsedScope on AppState is intentionally kept.
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
    activeTurnId: String? = nil,
    pinnedMessageIds: [String] = []
  ) {
    resetStreamState()
    sessionId = conversationId
    self.turns = turns.map { turn in
      switch turn {
      case let .user(id, content):
        return ChatTurnItem(serverMessageId: id, content: .user(text: content, imageCount: 0))
      case let .assistant(id, answer):
        return ChatTurnItem(serverMessageId: id, content: .assistant(answer))
      }
    }
    resolvedScope = format
    resolvedScopeSource = nil
    scopeSeed = nil
    streamingText = ""
    toolActivities = []
    errorBanner = nil
    currentTurnId = nil
    self.pinnedMessageIds = pinnedMessageIds
    mentionTokens = []
    deadMentionIds = []
    isEditingLast = false
    missingImagesNote = nil

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
      // Signed-in only: remember for New Chat (server also persists on the account).
      if case .signedIn = appState.authState {
        appState.lastUsedScope = format
      }
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
      // the turn. A recovery success replaces the last pair (REC-BR-2).
      applySuccessfulAnswer(answer)
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
      scopeSeed: request.scopeSeed,
      recovery: request.recovery,
      mentionedTeamIds: request.mentionedTeamIds
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

  // MARK: Recovery / mentions / slashes / chips / organize

  private func applySuccessfulAnswer(_ answer: OakAnswer) {
    if lastRequest?.recovery != nil, let lastIndex = lastAssistantIndex() {
      let existing = turns[lastIndex]
      turns[lastIndex] = ChatTurnItem(
        id: existing.id,
        serverMessageId: existing.serverMessageId,
        content: .assistant(answer)
      )
      if lastRequest?.recovery == .edit, let userIndex = lastUserIndex() {
        let user = turns[userIndex]
        turns[userIndex] = ChatTurnItem(
          id: user.id,
          serverMessageId: user.serverMessageId,
          content: .user(text: lastRequest?.message ?? "", imageCount: lastRequest?.images.count ?? 0)
        )
      }
      replaceLastGuestAssistant(answer)
    } else {
      turns.append(ChatTurnItem(content: .assistant(answer)))
      mirrorGuestTurn(GuestTurn(content: .assistant(answer: answer)))
    }
  }

  private func lastUserIndex() -> Int? {
    turns.lastIndex {
      if case .user = $0.content { return true }
      return false
    }
  }

  private func lastAssistantIndex() -> Int? {
    turns.lastIndex {
      if case .assistant = $0.content { return true }
      return false
    }
  }

  private func lastUserTurn() -> (text: String, imageCount: Int)? {
    guard let index = lastUserIndex(), case let .user(text, count) = turns[index].content else {
      return nil
    }
    return (text, count)
  }

  private func replaceLastGuestAssistant(_ answer: OakAnswer) {
    guard case .guest = appState.authState else { return }
    if let last = appState.guestThread.indices.last,
       appState.guestThread[last].role == .assistant
    {
      appState.guestThread[last] = GuestTurn(content: .assistant(answer: answer))
    }
  }

  private func handleSlash(_ target: SlashCommand.Target, argument: String?) {
    switch target {
    case .new:
      startNewConversation()
    case .team:
      appState.pendingDestination = .teams(query: argument)
    case .dex:
      appState.pendingDestination = .dex(query: argument)
    case .usage:
      break
    }
  }

  /// Refresh mention suggestions as the composer text changes.
  func updateMentionQuery() {
    guard isSignedIn else {
      mentionSuggestions = []
      return
    }
    let query = currentMentionQuery(in: composerText)
    guard let query else {
      mentionSuggestions = []
      return
    }
    let needle = query.lowercased()
    mentionSuggestions = savedTeams.filter { team in
      needle.isEmpty || team.name.lowercased().contains(needle)
    }
  }

  func insertMention(_ team: TeamSummary) {
    let token = FollowUpChips.MentionedTeam(id: team.id, name: team.name)
    if !mentionTokens.contains(where: { $0.id == team.id }) {
      mentionTokens.append(token)
    }
    composerText = replaceCurrentMention(in: composerText, with: "@\(team.name) ")
    mentionSuggestions = []
    deadMentionIds.remove(team.id)
  }

  func loadMentionTeams() async {
    guard isSignedIn, let teams else { return }
    savedTeams = (try? await teams.list(format: nil)) ?? []
  }

  func loadEmptyDeskRecents() async {
    guard isSignedIn, turns.isEmpty else {
      recentConversation = nil
      recentTeam = nil
      return
    }
    if let history {
      recentConversation = try? await history.list(
        query: nil,
        format: nil,
        folderId: nil,
        archived: false,
        includeArchived: false
      ).first
    }
    if let teams {
      recentTeam = try? await teams.list(format: nil).first
    }
  }

  func followUpChips(for answer: OakAnswer) -> [FollowUpChip] {
    if !isSignedIn {
      return FollowUpChips.derive(answer: answer, impliedFormat: impliedFormat(for: answer))
        .filter { $0.kind != .team }
    }
    return FollowUpChips.derive(
      answer: answer,
      impliedFormat: impliedFormat(for: answer),
      mentionedTeam: lastMentionedTeam
    )
  }

  func handleChip(_ chip: FollowUpChip) {
    switch chip.kind {
    case .scope:
      selectScope(Format(rawValue: chip.target))
    case .dex:
      appState.pendingDestination = .dex(query: chip.target)
    case .team:
      appState.pendingDestination = .team(id: chip.target)
    }
  }

  func pinTurn(_ item: ChatTurnItem) async {
    guard isSignedIn, let history, let messageId = item.serverMessageId else { return }
    let pinning = !pinnedMessageIds.contains(messageId)
    do {
      pinnedMessageIds = try await history.setTurnPinned(
        conversationId: sessionId,
        messageId: messageId,
        pinned: pinning
      )
    } catch {
      errorBanner = banner(for: error as? OakError ?? .transport(underlying: "pin"))
    }
  }

  func forkFrom(_ item: ChatTurnItem) async {
    guard isSignedIn, let history, let messageId = item.serverMessageId else { return }
    do {
      let result = try await history.fork(conversationId: sessionId, throughMessageId: messageId)
      appState.pendingDestination = .conversation(id: result.id)
    } catch {
      errorBanner = banner(for: error as? OakError ?? .transport(underlying: "fork"))
    }
  }

  func shareTurn(_ item: ChatTurnItem) async -> URL? {
    guard isSignedIn, let shares, let messageId = item.serverMessageId else { return nil }
    do {
      let created = try await shares.create(
        conversationId: sessionId,
        assistantMessageId: messageId
      )
      return URL(string: created.url)
    } catch {
      errorBanner = banner(for: error as? OakError ?? .transport(underlying: "share"))
      return nil
    }
  }

  func hydratePinnedIds(_ ids: [String]) {
    pinnedMessageIds = ids
  }

  /// Export this thread as Markdown or PDF, then the caller presents the share sheet.
  func exportConversation(as format: ConversationExportFormat) async -> URL? {
    guard isSignedIn, let history, !turns.isEmpty else { return nil }
    do {
      let data = try await history.exportConversation(id: sessionId, format: format)
      return try writeExportFile(data: data, filename: "oak-conversation.\(format.fileExtension)")
    } catch let error as OakError {
      errorBanner = banner(for: error)
      return nil
    } catch {
      errorBanner = ErrorBanner(message: Self.genericMessage, isRetryable: false)
      return nil
    }
  }

  private func impliedFormat(for answer: OakAnswer) -> Format? {
    let raw = answer.generationBasis.generation
    let mapped = Format(rawValue: raw)
    if case .unknown = mapped { return nil }
    if mapped == displayFormat { return nil }
    return mapped
  }

  /// Bind `@Name` tokens: autocomplete taps *or* free-typed names that match a
  /// saved team. Unmatched `@tokens` are dead and block send (MEN-AC-1.3).
  private func resolveMentions(in text: String) -> [FollowUpChips.MentionedTeam] {
    deadMentionIds = []
    guard isSignedIn else { return [] }

    var bound: [FollowUpChips.MentionedTeam] = []
    let teamsByLength = savedTeams.sorted { $0.name.count > $1.name.count }
    var index = text.startIndex

    while index < text.endIndex {
      guard text[index] == "@",
            index == text.startIndex || text[text.index(before: index)].isWhitespace
      else {
        index = text.index(after: index)
        continue
      }
      let afterAt = text.index(after: index)
      let rest = text[afterAt...]
      if let team = matchSavedTeam(in: rest, teams: teamsByLength) {
        if !bound.contains(where: { $0.id == team.id }) {
          bound.append(FollowUpChips.MentionedTeam(id: team.id, name: team.name))
        }
        index = text.index(afterAt, offsetBy: team.name.count)
        continue
      }
      let token = nextAtToken(in: rest)
      if !token.isEmpty {
        deadMentionIds.insert(token)
        index = text.index(afterAt, offsetBy: token.count)
      } else {
        index = afterAt
      }
    }

    return Array(bound.prefix(6))
  }

  private func matchSavedTeam(
    in rest: Substring,
    teams: [TeamSummary]
  ) -> TeamSummary? {
    for team in teams {
      guard rest.count >= team.name.count else { continue }
      let end = rest.index(rest.startIndex, offsetBy: team.name.count)
      let slice = rest[rest.startIndex..<end]
      guard slice.compare(team.name, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
      else { continue }
      if end == rest.endIndex || rest[end].isWhitespace { return team }
    }
    return nil
  }

  private func writeExportFile(data: Data, filename: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
    try data.write(to: url, options: .atomic)
    return url
  }

  private func nextAtToken(in rest: Substring) -> String {
    var end = rest.startIndex
    while end < rest.endIndex, !rest[end].isWhitespace {
      end = rest.index(after: end)
    }
    return String(rest[rest.startIndex..<end])
  }

  private func currentMentionQuery(in text: String) -> String? {
    guard let at = text.lastIndex(of: "@") else { return nil }
    let after = text[text.index(after: at)...]
    if after.contains(where: { $0.isNewline || $0 == " " && after.first == " " }) {
      // still allow mid-token (no space yet)
    }
    if after.contains(where: \.isNewline) { return nil }
    if after.contains(" ") { return nil }
    return String(after)
  }

  private func replaceCurrentMention(in text: String, with replacement: String) -> String {
    guard let at = text.lastIndex(of: "@") else { return text + replacement }
    return String(text[..<at]) + replacement
  }

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
    /// Server message id when known (history / after persist). Needed for pin/fork/share.
    let serverMessageId: String?
    let content: Content

    init(id: UUID = UUID(), serverMessageId: String? = nil, content: Content) {
      self.id = id
      self.serverMessageId = serverMessageId
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
    var recovery: ChatRecovery? = nil
    var mentionedTeamIds: [String]? = nil
  }
}
