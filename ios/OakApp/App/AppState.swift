import Foundation
import Observation

/// Root session/app state, injected through the SwiftUI environment.
///
/// Holds the cross-cutting state that outlives any single screen: the current
/// auth state, the active conversation id, the in-memory guest thread, and that
/// thread's resolved data scope (for the sign-in import). `@MainActor` because
/// everything here drives UI; `@Observable` so views update on change.
///
/// P1 ships this as a real stub; later phases extend it (P5 wires auth
/// transitions + the guest→sign-in handoff via `HistoryService.importGuestThread`;
/// P6 appends to the guest thread as turns happen).
@MainActor
@Observable
final class AppState {
  /// Whether the user is a guest or signed in (`AuthState` is defined below and is
  /// the canonical type — `AuthService` in P5 reuses it, it is not redefined).
  var authState: AuthState = .guest

  /// The active conversation id. `nil` means a fresh, unsaved thread.
  var activeConversationId: String?

  /// The in-memory guest thread: turns kept only for the session and never
  /// persisted. On sign-in these are mapped to the import payload (P9). Stubbed
  /// here with a lightweight turn model; P6 populates it as the chat streams.
  var guestThread: [GuestTurn] = []

  /// The guest thread's resolved data scope, mirrored from the chat reducer's
  /// `scope` events so the guest→sign-in import can persist the thread under
  /// the scope it actually ran in. Champions-first: defaults to Champions
  /// (CF-DATA-BR-1); leftover other-format values are not used to pick a game.
  var guestThreadScope: Format = .champions

  /// Signed-in account's last-used game scope for NEW chats (from `GET /api/auth/me`
  /// + every subsequent `scope` event while signed in). Survives New Chat so the
  /// chip doesn't flash National Dex for a user mid–Gen 7 run. `nil` for guests
  /// and never-chatted accounts. Mirrors web's `lastUsedScope` (`page.tsx`).
  var lastUsedScope: Format?

  /// Signed-in MRU scopes (SCOPE-US-2), most recent first. Empty for guests.
  var lastUsedScopes: [Format] = []

  /// A pending in-app hop (slash / chip / share URL). Consumed by ``RootView``.
  var pendingDestination: AppDestination?

  /// Compact / full answer-card default (COMPACT-US-1). Full is the factory default.
  var answerDensity: AnswerDensity = .full

  /// Device-local Light / Dark / System appearance. Default System follows the
  /// iPhone setting. Writes through to ``appearanceStore`` on change.
  var appearance: AppearancePreference {
    didSet {
      guard appearance != oldValue else { return }
      appearanceStore.preference = appearance
    }
  }

  @ObservationIgnored
  private let appearanceStore: any AppearanceStoring

  /// Incoming species for the signed-in Add-to-team sheet (ADD-US-1). `nil` when idle.
  var pendingAddToTeam: TeamMember?

  /// Explain-from-calculator should land as a normal chat send.
  var pendingChatSend: String?

  /// Pending server-side turns keyed by conversation id (`session_id`) → the
  /// server-minted `turn_id` still generating for that thread
  /// (background-turns/design.md §6 / §6.2). It lives here — not on the chat view
  /// model — so it **survives view teardown**: navigating away from a thread
  /// closes its stream (`ChatViewModel.detach()`) without cancelling the turn, and
  /// the pointer kept here lets the thread reattach when reopened. Set on the `turn`
  /// frame; cleared on any terminal event (answer/error/stopped) or a resume 404.
  private(set) var pendingTurns: [String: String] = [:]

  init(appearanceStore: any AppearanceStoring = InMemoryAppearanceStore()) {
    self.appearanceStore = appearanceStore
    self.appearance = appearanceStore.preference
  }

  /// Records the turn generating for `conversationId` (the `turn` SSE frame).
  func setPendingTurn(conversationId: String, turnId: String) {
    pendingTurns[conversationId] = turnId
  }

  /// Clears the pending-turn pointer for `conversationId` (a terminal event, an
  /// explicit stop, or a resume 404). A no-op when none is recorded.
  func clearPendingTurn(conversationId: String) {
    pendingTurns[conversationId] = nil
  }

  /// The turn id still generating for `conversationId`, if any.
  func pendingTurn(for conversationId: String) -> String? {
    pendingTurns[conversationId]
  }
}

// MARK: - Auth transitions (P5)

extension AppState {
  /// Restores the session on launch (accounts-and-access.md M-AC-2.5): ask the
  /// backend who we are. The client attaches the stored Bearer token (if any), so
  /// a valid token resolves to `.signedIn`, an absent/expired token to `.guest`
  /// (the `me` route returns guest as a first-class 200). A transport failure
  /// leaves the state as the launch default (guest) rather than throwing — the
  /// next authed call will surface connectivity if it persists.
  func restoreSession(using auth: any AuthService) async {
    do {
      let snapshot = try await auth.me()
      authState = snapshot.state
      // Seed the new-chat chip from the account preference (signed-in only).
      if case .signedIn = snapshot.state {
        lastUsedScope = snapshot.lastUsedScope
        lastUsedScopes = snapshot.lastUsedScopes
      } else {
        lastUsedScope = nil
        lastUsedScopes = []
      }
    } catch {
      Log.auth.error("session restore failed; remaining a guest")
    }
  }

  /// Applies a completed verification: flip the whole app to signed-in
  /// (M-ACCT-US-2). The token was already persisted by the service. The on-screen
  /// guest thread is preserved (M-AC-4.1); importing it into durable history is a
  /// separate, non-fatal step — ``importGuestThread(using:)`` — invoked from the
  /// sign-in flow once a `HistoryService` is in hand, so the state flip here stays
  /// synchronous and dependency-free.
  ///
  /// `lastUsedScope` is typically nil on a fresh sign-in (verify doesn't return
  /// it); the next `scope` event or a later `me()` restore fills it in.
  func completeSignIn(email: String, lastUsedScope: Format? = nil) {
    authState = .signedIn(email: email)
    if let lastUsedScope {
      self.lastUsedScope = lastUsedScope
    }
  }

  /// Signs out (M-ACCT-US-3): best-effort server revoke + Keychain clear via the
  /// service, then return to guest. Never throws — sign-out must always succeed in
  /// returning the device to guest.
  func signOut(using auth: any AuthService) async {
    do {
      try await auth.signOut()
    } catch {
      Log.auth.error("sign-out failed; clearing local session anyway")
    }
    resetToGuest()
  }

  /// Handles a `401` on a previously-authed call (api-design.md "Authentication"):
  /// the session expired or was revoked, so drop the token and return to guest,
  /// prompting a re-sign-in. The revoke endpoint is idempotent, so reusing
  /// `signOut` to clear the now-orphaned token is safe.
  func handleUnauthorized(using auth: any AuthService) async {
    Log.auth.info("received 401 on an authed call; returning to guest")
    do {
      try await auth.signOut()
    } catch {
      Log.auth.error("token drop after 401 failed")
    }
    resetToGuest()
  }

  /// Deletes the account and its server data, then returns to guest
  /// (M-ACCT-US-6). A real backend failure propagates so the UI doesn't falsely
  /// report deletion; only a confirmed deletion reaches the guest reset.
  func deleteAccount(using auth: any AuthService) async throws {
    try await auth.deleteAccount()
    resetToGuest()
  }

  /// Clears all session-scoped state back to the guest baseline.
  private func resetToGuest() {
    authState = .guest
    activeConversationId = nil
    lastUsedScope = nil
    lastUsedScopes = []
    pendingDestination = nil
    // Drop any pending-turn pointers — they belonged to the now-signed-out account
    // (or the prior guest session) and must not drive a reattach after the reset.
    pendingTurns.removeAll()
  }
}

// MARK: - Guest → sign-in thread import (P9)

extension AppState {
  /// Persists the in-memory guest thread to durable history right after sign-in
  /// (M-ACCT-US-4 / component-design.md "Guest→sign-in"). Maps the session-only
  /// ``GuestTurn``s into the wire ``ChatTurn``s the import endpoint expects and
  /// uploads them under a stable session id; the returned conversation id becomes
  /// the active conversation so follow-ups continue the same thread.
  ///
  /// **Non-fatal by design:** an empty thread imports nothing (returns `nil`), and
  /// any failure is logged and swallowed — the on-screen thread is preserved either
  /// way (M-AC-4.1), so a transient backend problem never costs the user their
  /// visible conversation. The returned id is the new conversation's id (or `nil`).
  ///
  /// Called from the sign-in flow once a ``HistoryService`` is available (the wiring
  /// point lives at the app's composition root, where services are constructed).
  @discardableResult
  func importGuestThread(using history: any HistoryService) async -> String? {
    guard !guestThread.isEmpty else { return nil }

    // Reuse the active conversation id when one exists; otherwise mint a fresh
    // session id (the import route creates the conversation under this id and
    // echoes it back as the returned id).
    let sessionId = activeConversationId ?? UUID().uuidString
    let turns = guestThread.map(\.asChatTurn)

    do {
      let id = try await history.importGuestThread(
        sessionId: sessionId,
        format: guestThreadScope,
        turns: turns
      )
      if let id {
        activeConversationId = id
      }
      return id
    } catch {
      Log.auth.error("guest thread import failed; keeping the on-screen thread")
      return nil
    }
  }
}

private extension GuestTurn {
  /// Maps a session-only guest turn into the wire ``ChatTurn`` the import endpoint
  /// validates. A user turn carries its text verbatim; an assistant turn carries its
  /// COMPLETE ``OakAnswer`` (reasoning, citations, inferences, subjects, …), so the
  /// guest→sign-in import is **non-lossy** — the server re-validates it against
  /// `oakAnswerSchema` and stores the full turn. The stored turn id (a UUID) keys the
  /// import's idempotent upsert.
  var asChatTurn: ChatTurn {
    switch content {
    case let .user(text):
      return .user(id: id.uuidString, content: text)
    case let .assistant(answer):
      return .assistant(id: id.uuidString, answer: answer)
    }
  }
}

/// Whether the user is browsing as a guest or signed in with an email account.
///
/// Canonical home: this is the single definition used by `AppState` and by P5's
/// `AuthService`/`AuthViewModel`. Do not redefine it elsewhere.
enum AuthState: Equatable, Sendable {
  case guest
  case signedIn(email: String)
}

/// In-app navigation requested by a slash, follow-up chip, or share URL.
enum AppDestination: Equatable, Sendable {
  case teams(query: String?)
  case team(id: String)
  case dex(query: String?)
  case dexHop(DexArtifactHop)
  /// First-class / Expand calculator. Associated scenario is carried into the
  /// full-screen `CalculatorView` (CALC-AC-1.2 / 2.3) — never a chat bounce.
  case calculator(CalcScenario?)
  case conversation(id: String)
  case share(id: String)
  /// Usage tab (ADR-6). Optional species slug for a drill-in.
  case usage(slug: String?)
}

/// One turn of the in-memory guest thread (session-only, never persisted).
///
/// A user turn carries its raw text; an assistant turn carries the COMPLETE
/// ``OakAnswer`` (not just its prose) so the guest→sign-in import preserves full
/// fidelity — reasoning, citations, inferences, and every structured block survive
/// sign-in, matching web's full-turn import.
struct GuestTurn: Identifiable, Sendable, Equatable {
  /// A guest turn's payload, discriminated by role.
  enum Content: Sendable, Equatable {
    /// A user message — its raw text.
    case user(text: String)
    /// A finalized assistant answer — the full ``OakAnswer`` the reducer had at
    /// finalize time (imported verbatim, re-validated server-side).
    case assistant(answer: OakAnswer)
  }

  /// The turn's role. Kept as a first-class type so call sites (and tests) can branch
  /// on the role without pattern-matching the payload.
  enum Role: String, Sendable, Equatable {
    case user
    case assistant
  }

  let id: UUID
  let content: Content

  init(id: UUID = UUID(), content: Content) {
    self.id = id
    self.content = content
  }

  /// The turn's role, derived from its content.
  var role: Role {
    switch content {
    case .user: return .user
    case .assistant: return .assistant
    }
  }
}
