import Foundation
import Observation

/// The team-builder assistant's view model — the SSE reducer behind the editor's
/// assistant panel (parity with web's `useTeamsAssistant` + `TeamsAssistantPanel`).
/// It holds the in-memory thread, folds a ``BuilderSSEEvent`` stream into UI state
/// one event at a time, and brokers Apply/Undo of a proposed ``TeamPatch`` against
/// the owning ``TeamEditorViewModel``'s **unsaved draft** — never the DB (the user
/// still reviews and hits Save).
///
/// `@MainActor @Observable`. It depends on the ``TeamsAssistantService`` **protocol**
/// (never `LiveTeamsAssistantService`) so it unit-tests against a fake, and holds a
/// reference to the live ``TeamEditorViewModel`` so the draft it sends each turn — and
/// the draft Apply mutates — is always the current on-screen team.
///
/// Reducer contract (`teams-assistant-sse-types.ts`, a sibling of chat MINUS `scope`):
/// `tool_activity`* → `answer_start`*/`answer_delta`* → exactly one terminal `answer`
/// (a ``BuilderAnswer``, authoritative). `answer_start` clears the streamed buffer;
/// `answer_delta` appends; the terminal answer attaches to the in-flight turn and
/// stops. A transport fault (thrown `OakError` or an in-band `error` event) drops the
/// half-finished turn, surfaces a friendly banner, and exposes a Retry — exactly like
/// the web hook.
@MainActor
@Observable
final class TeamsAssistantViewModel {

  /// One committed exchange in the panel's thread.
  struct Turn: Identifiable, Equatable {
    let id: Int
    let user: String
    /// `nil` while this turn is still streaming.
    var answer: BuilderAnswer?
  }

  /// The panel's coarse status (mirrors web's `AssistantStatus`).
  enum Status: Equatable {
    case idle
    case thinking
    case error
  }

  // MARK: Thread + streaming state

  /// The committed turns (user message + finalized ``BuilderAnswer``), oldest first.
  private(set) var turns: [Turn] = []

  /// The panel's status. `thinking` disables the composer's send.
  private(set) var status: Status = .idle

  /// The latest tool-activity label while thinking (or `nil`).
  private(set) var activity: String?

  /// The incrementally streamed `answer_markdown` for the in-flight turn.
  private(set) var streamingMarkdown: String = ""

  /// A transport-fault banner message (in-domain failures ride a normal answer).
  /// `nil` when clear.
  private(set) var errorMessage: String?

  // MARK: Apply / Undo state

  /// Turn ids whose patch has been applied to the draft (drives the "Applied ✓" label).
  private(set) var appliedTurnIds: Set<Int> = []

  /// The most recent Apply: the turn it came from and the pre-apply draft snapshot to
  /// restore on Undo. Only this turn shows an Undo affordance (mirrors web's `lastApplied`).
  private(set) var lastApplied: (turnId: Int, snapshot: TeamDraftSnapshot)?

  // MARK: Dependencies + identity

  private let service: any TeamsAssistantService
  private let editor: TeamEditorViewModel

  /// The client thread id sent as `session_id` — one in-memory conversation per mounted
  /// panel (server namespaces history under it). A remount starts a fresh thread by design.
  let sessionId: String

  /// The last message sent, kept so ``retry()`` can re-send after a recoverable failure.
  private(set) var lastMessage: String = ""

  private var nextId = 1

  /// The in-flight stream consumer; cancelled on a new turn or panel dismiss. Exposed
  /// (`private(set)`) so tests can `await streamTask?.value` to drain a scripted turn.
  private(set) var streamTask: Task<Void, Never>?

  init(service: any TeamsAssistantService, editor: TeamEditorViewModel) {
    self.service = service
    self.editor = editor
    self.sessionId = UUID().uuidString
  }

  // MARK: Derived state

  /// Whether the composer can send: not already thinking, and some non-blank text.
  func canSend(_ text: String) -> Bool {
    status != .thinking && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// The one-tap first-use prompts (mirror web's `ASSISTANT_SUGGESTIONS`).
  static let suggestions = ["Check my coverage", "Fill slot 3", "Suggest an item"]

  // MARK: Actions

  /// Sends one turn: appends the user message immediately, resets the streaming state,
  /// and starts consuming the event stream with the LIVE editor draft attached. A no-op
  /// while a turn is already in flight or the text is blank.
  func send(_ message: String) {
    let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
    guard status != .thinking, !text.isEmpty else { return }

    streamTask?.cancel()
    lastMessage = text
    let id = nextId
    nextId += 1

    turns.append(Turn(id: id, user: text, answer: nil))
    status = .thinking
    activity = nil
    streamingMarkdown = ""
    errorMessage = nil

    let draft = TeamsAssistantDraft(
      name: editor.name,
      format: editor.format,
      members: editor.draftWireMembers()
    )
    streamTask = Task { [weak self] in
      await self?.consume(turnId: id, message: text, draft: draft)
    }
  }

  /// Re-sends the last message after a recoverable failure (its half-finished turn was
  /// already dropped, so this re-appends cleanly). Mirrors the panel's Retry button.
  func retry() {
    guard status != .thinking, !lastMessage.isEmpty else { return }
    send(lastMessage)
  }

  /// Applies a turn's proposed patch to the editor's unsaved draft, snapshotting the
  /// pre-apply draft so ``undo()`` can restore it. Marks the turn applied.
  func apply(_ turn: Turn) {
    guard let patch = turn.answer?.teamPatch else { return }
    lastApplied = (turnId: turn.id, snapshot: editor.draftSnapshot())
    appliedTurnIds.insert(turn.id)
    editor.applyAssistantPatch(patch)
  }

  /// Restores the pre-apply draft snapshot (Undo) and un-marks the turn.
  func undo() {
    guard let applied = lastApplied else { return }
    editor.restoreDraft(applied.snapshot)
    appliedTurnIds.remove(applied.turnId)
    lastApplied = nil
  }

  /// Tears down any in-flight stream (panel dismissed / view disappeared). Committed
  /// turns are left intact — reopening the panel resumes the same in-memory thread — but
  /// a half-finished in-flight turn is dropped and the status reset to idle, so a
  /// mid-stream dismiss can never leave the panel stuck "thinking". The consumer's
  /// CancellationError path returns silently, so it won't clobber this reset.
  func cancel() {
    streamTask?.cancel()
    streamTask = nil
    guard status == .thinking else { return }
    turns.removeAll { $0.answer == nil }
    status = .idle
    activity = nil
    streamingMarkdown = ""
  }

  // MARK: Reducer

  /// Consumes one turn's event stream, folding events into UI state and committing the
  /// terminal ``BuilderAnswer`` to the turn. A thrown transport fault or a stream that
  /// ends without an answer drops the half-finished turn and raises a banner.
  private func consume(turnId: Int, message: String, draft: TeamsAssistantDraft) async {
    var terminal: BuilderAnswer?
    var inbandError: String?

    do {
      for try await event in service.send(sessionId: sessionId, message: message, draft: draft) {
        switch event {
        case let .toolActivity(_, label):
          activity = label
        case .answerStart:
          streamingMarkdown = ""
        case let .answerDelta(text):
          streamingMarkdown += text
        case let .answer(answer):
          terminal = answer
        case let .error(_, message, _):
          inbandError = message
        }
      }
    } catch is CancellationError {
      // Panel reset / unmount — drop silently (never leaves a banner).
      return
    } catch let error as OakError {
      finishWithFailure(turnId: turnId, message: TeamEditorViewModel.message(for: error))
      return
    } catch {
      finishWithFailure(turnId: turnId, message: TeamEditorViewModel.genericMessage)
      return
    }

    if let terminal {
      if let index = turns.firstIndex(where: { $0.id == turnId }) {
        turns[index].answer = terminal
      }
      status = .idle
      activity = nil
      streamingMarkdown = ""
    } else {
      finishWithFailure(
        turnId: turnId,
        message: inbandError ?? "The stream ended without an answer."
      )
    }
  }

  /// Drops the in-flight turn and raises a recoverable banner (mirrors the web hook's
  /// catch path: a retry re-sends cleanly rather than duplicating a half-turn).
  private func finishWithFailure(turnId: Int, message: String) {
    turns.removeAll { $0.id == turnId }
    errorMessage = message
    status = .error
    activity = nil
    streamingMarkdown = ""
  }
}
