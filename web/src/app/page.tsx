"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSseClient } from "@/lib/sse/sse-client";
import { useScreenWakeLock } from "@/lib/hooks/use-screen-wake-lock";
import ChatThread from "@/components/chat/ChatThread";
import Composer from "@/components/chat/Composer";
import ThemeToggle from "@/components/controls/ThemeToggle";
import AuthMenu from "@/components/auth/AuthMenu";
import AuthDialog from "@/components/auth/AuthDialog";
import ConversationList from "@/components/history/ConversationList";
import AppNav from "@/components/nav/AppNav";
import SidebarToggle from "@/components/controls/SidebarToggle";
import ScopeChip from "@/components/controls/ScopeChip";
import VoiceOverlay from "@/components/voice/VoiceOverlay";
import SavedTeamAutoOpen from "@/components/teams/SavedTeamAutoOpen";
import LandingSection from "@/components/landing/LandingSection";
import { ArtifactViewerProvider } from "@/components/artifact/ArtifactViewerProvider";
import ArtifactViewer from "@/components/artifact/ArtifactViewer";
import { fetchMe, type MeResult } from "@/lib/api/auth-client";
import { useConversations } from "@/lib/hooks/use-conversations";
import { getConversation, importConversation } from "@/lib/api/history-client";
import { isFormat, type Format } from "@/data/formats";
import type {
  ChatStatus,
  ChatTurn,
  OakAnswer,
  PendingImage,
  SavedTeam,
} from "@/components/types";

/** localStorage key for the persisted history-sidebar collapsed choice. */
const SIDEBAR_STORAGE_KEY = "oak-sidebar-collapsed";

/** DOM id of the history sidebar — the toggle's `aria-controls` target. */
const SIDEBAR_ID = "history-sidebar";

/** A request stopped within this many ms of being sent wipes the chat. */
const QUICK_STOP_MS = 2000;

/** Generate a stable id (session id + turn ids). Falls back when crypto.randomUUID is absent. */
function makeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Home — the Oak chat page (design.md § Phase 7).
 *
 * Owns the conversation surface: a stable `session_id`, the committed `turns[]`
 * (user + assistant), and the in-flight turn via `useSseClient` (the manual SSE
 * client hook — NOT EventSource). When a turn's terminal answer lands it is
 * committed as an assistant turn (in-domain failures included — they arrive as a
 * normal answer). Suggestion/candidate follow-ups are plain `send` calls reusing
 * the same `session_id` (ux-design.md). Visuals deferred to `frontend-design`.
 */
export default function Home() {
  const [sessionId, setSessionId] = useState<string>(() => makeId());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Session-only thumbnails for user turns that attached images, keyed by turn id
  // (a client side-channel — the turn + persisted history stay text-only).
  const [imagePreviews, setImagePreviews] = useState<Record<string, string[]>>(
    {},
  );
  const {
    status,
    turnId,
    scope,
    activities,
    answer,
    streamingMarkdown,
    error,
    reconnecting,
    send,
    resume,
    stop,
    reset,
    retry,
  } = useSseClient();

  // Keep the screen awake while a turn is in flight. On a phone the screen
  // otherwise auto-locks during a long (image) turn, suspending the page and
  // killing the SSE connection — the root cause of the mobile "stream error".
  // `status === "thinking"` spans the whole in-flight window, including an
  // automatic reconnect (status stays "thinking" throughout).
  useScreenWakeLock(status === "thinking");

  // Auth identity (account-creation design.md § API "/api/auth/me"; AUTH-US-1 /
  // AC-1.2). Auth is a SEPARATE concern from the conversation: it lives in a
  // cookie/account, never in `sessionId`/`turns[]`, so signing in or out must
  // leave the on-screen thread untouched (BR-A10 / AUTH-US-6 — enforced below).
  // Declared above scope-mirroring so the signed-in gate for lastUsedScope can
  // read it without a temporal-dead-zone reference.
  const [auth, setAuth] = useState<MeResult>({ signedIn: false });
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  // Voice mode (signed-in only). Guests tapping the mic get the sign-in dialog
  // — the app's existing gate for signed-in-only features — instead of the
  // overlay. The endpoints 401 regardless, so this is UX, not the security line.
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Server-resolved scope for the conversation (GS-C). The hook's `scope` is the
  // per-turn `scope` SSE frame — `null` on a fresh send and until that frame
  // lands — so mirror it into page-level state that STICKS between turns (and is
  // seeded from a saved conversation's stored format in `handleOpenConversation`
  // below). This drives the header scope chip + the artifact viewer's data scope,
  // so a server override of the toggle (e.g. a "gen 7" message) is made visible.
  const [resolvedScope, setResolvedScope] = useState<Format | null>(null);
  // Signed-in account's last-used scope for NEW chats (from GET /api/auth/me +
  // every subsequent `scope` event). Survives New Chat so the chip doesn't flash
  // National Dex for a user mid–Gen 7 run. Guests leave this null.
  const [lastUsedScope, setLastUsedScope] = useState<Format | null>(null);
  // An explicit chip pick, sent as `scope_seed` on the NEXT turn only. Cleared
  // on every scope event: once the server has acknowledged a turn (any turn),
  // the seed's job is done — the conversation's scope is now sticky server-side,
  // which outranks a stale seed on the FOLLOWING turn (scope_seed > sticky).
  // Leaving a stale seed set would silently re-assert an old pick over the now-
  // current sticky scope. (Known edge: an unsupported-gen turn emits no scope
  // event at all, so a pending seed survives it and rides the next message —
  // benign, since that's still the user's most recent explicit intent.)
  const [scopeSeed, setScopeSeed] = useState<Format | null>(null);
  useEffect(() => {
    if (scope) {
      setResolvedScope(scope.format);
      // Only signed-in accounts remember scope across New Chat (server stores
      // account.last_used_scope). Guests keep lastUsedScope null so New Chat
      // always falls back to national-dex.
      if (auth.signedIn) setLastUsedScope(scope.format);
      setScopeSeed(null);
    }
  }, [scope, auth.signedIn]);

  // Track the active request so Stop can decide between a quick-stop reset and a
  // plain stop, and restore the stopped message into the composer.
  const requestStartRef = useRef<number>(0);
  const inFlightMessageRef = useRef<string>("");

  // Pending durable turn per conversation (background-turns/design.md §6.1:
  // "keep pending turn id per session"). A conversation whose turn keeps running
  // server-side after we detach (switched away, or backgrounded) records its
  // turn id here, keyed by session id, so reopening it can reattach. A ref (not
  // state) — it never drives render, only the reopen decision. The authoritative
  // reopen path for a signed-in thread is `active_turn` from the conversation
  // GET (server-side, survives an app relaunch); this map is the same-session
  // hint that complements it.
  const pendingTurnsRef = useRef<Map<string, string>>(new Map());
  // Record the current turn's id against its conversation once the `turn` frame
  // lands (§6.1). Only ADDS — a detach (reset on switch) must NOT drop another
  // conversation's pending pointer, so removal is handled on terminal only.
  useEffect(() => {
    if (turnId) pendingTurnsRef.current.set(sessionId, turnId);
  }, [turnId, sessionId]);
  // Clear the pending pointer when the ACTIVE conversation's turn reaches a
  // terminal state (the hook only streams the active thread, so a `done`/`error`
  // here belongs to `sessionId`). A stopped turn is cleared in `handleStop`.
  useEffect(() => {
    if (status === "done" || status === "error") {
      pendingTurnsRef.current.delete(sessionId);
    }
  }, [status, sessionId]);
  // A fresh object pushed into the Composer to reload its input after a quick
  // stop (identity change is what triggers the reload).
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  // One-time cleanup: the Champions toggle (and its localStorage-persisted
  // choice) is gone — the header scope chip is now the sole scope control, and
  // the server defaults a seedless fresh conversation to National Dex itself.
  // Clear any stale value left by a previous build so it can't linger unread
  // forever.
  useEffect(() => {
    try {
      localStorage.removeItem("oak-champions-mode");
    } catch {
      /* storage unavailable (private mode) — nothing to clean up */
    }
  }, []);

  // Reference-page CTA prefill (B4): a `?q=` param (from an AskOakCta link)
  // seeds the composer once, then is stripped from the URL so a reload doesn't
  // re-prefill and the shared link stays clean. Runs once on mount.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        setPrefill({ text: q });
        history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* URL/history unavailable — no prefill, no harm */
    }
  }, []);

  // App-rail collapsed state. The rail is now visible to everyone (guests get
  // nav + a sign-in hint where history would go), so it's present in SSR
  // markup from the start — default expanded there is deterministic and
  // matches the eventual desktop resolution for the common case. Resolve the
  // real choice after mount: a stored explicit choice wins; absent one,
  // narrow screens (≤768px) start collapsed (decided once, like the artifact
  // viewer's CSS breakpoint). `railBoot` suppresses the collapse transition
  // until this resolution lands, so an SSR-expanded rail that mount-corrects
  // to collapsed (mobile) doesn't visibly slide shut on first paint.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [railBoot, setRailBoot] = useState(true);
  useEffect(() => {
    try {
      // On a phone the sidebar is an overlay drawer, so it must NEVER start open
      // (it would cover the chat). Force-collapse there regardless of a stored
      // desktop preference — without persisting, so the desktop choice survives.
      const isMobile =
        window.matchMedia?.("(max-width: 768px)").matches ?? false;
      if (isMobile) {
        setSidebarCollapsed(true);
        return;
      }
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === "true" || stored === "false") {
        setSidebarCollapsed(stored === "true");
      }
      // else: keep the default (expanded) on desktop.
    } catch {
      /* storage/matchMedia unavailable — keep the default (expanded) */
    } finally {
      setRailBoot(false);
    }
  }, []);

  const setSidebarCollapsedPersisted = useCallback((next: boolean) => {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable (private mode) — fall back to in-session only */
    }
  }, []);

  // Narrow-viewport flag (fable-ui §4 screen 01). On desktop the empty-state
  // composer is promoted into the centered hero; on a phone (≤640px) it stays
  // bottom-docked for thumb reach. Default `false` (desktop-first) so the SSR /
  // first-client render places the empty composer in the hero with no hydration
  // mismatch and no flash for the common (desktop) case; a phone corrects to
  // docked once this resolves post-mount. Kept in sync on resize.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 640px)");
    if (!mq) return;
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Durable chat history (chat-history B-3). The hook lists/searches/filters and
  // mutates the signed-in account's conversations; it stays empty + makes no
  // fetch for guests (`enabled = auth.signedIn`). The conversation `sessionId`
  // below IS the conversation id (HIST-AD-1), so opening / new-chat / import all
  // hang off it. `refresh`/`remove` are stable, so we use them in deps directly.
  const conversations = useConversations(auth.signedIn);
  const { refresh: refreshConversations, remove: removeConversation } =
    conversations;

  // Resolve auth state on mount so the header renders guest vs signed-in. The
  // page is a client component, so this runs after hydration; `fetchMe` never
  // throws (a guest / unknown cookie / transport fault all resolve to
  // `{ signedIn: false }`), so no error path is needed (BR-A11).
  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (!active) return;
      setAuth(me);
      // Seed the new-chat default chip from the account preference (signed-in
      // only). Guests and never-chatted accounts leave lastUsedScope null →
      // national-dex display fallback.
      if (
        me.signedIn &&
        typeof me.lastUsedScope === "string" &&
        isFormat(me.lastUsedScope)
      ) {
        setLastUsedScope(me.lastUsedScope);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Sign-in completed in the dialog. Close it and re-resolve identity (to pick up
  // the account email for the menu). CRITICAL: we do NOT touch `sessionId` or
  // `turns[]` — the conversation visible before sign-in stays visible and usable
  // (BR-A10 / AC-6.1, AC-6.2). The `created` flag (new account vs returning
  // login) is intentionally not surfaced here; both paths land in the same UI.
  const handleSignedIn = useCallback(() => {
    setAuthDialogOpen(false);
    void fetchMe().then((me) => {
      setAuth(me);
      if (
        me.signedIn &&
        typeof me.lastUsedScope === "string" &&
        isFormat(me.lastUsedScope)
      ) {
        setLastUsedScope(me.lastUsedScope);
      }
      // BR-H10 / HIST-US-12: the on-screen guest thread's full-fidelity turns
      // live only on the client at this moment, so save them into the new
      // account (idempotent import), then surface it in the now-enabled history
      // list. An empty thread imports nothing (AC-12.2 — repo returns null).
      if (me.signedIn && turns.length > 0) {
        // Import the guest thread under its RESOLVED scope (GS-C): a thread that
        // switched to e.g. gen-7 via an in-message signal must import as gen-7,
        // not as whatever the header chip currently shows. Fall back to the
        // national-dex default when no turn has resolved a scope yet. A pending
        // `scopeSeed` is deliberately excluded — no turn ran under it yet.
        const importFormat: Format = resolvedScope ?? "national-dex";
        void importConversation(sessionId, turns, importFormat).then(() =>
          refreshConversations(),
        );
      }
    });
  }, [sessionId, turns, refreshConversations, resolvedScope]);

  // Sign-out completed (current device only — AC-5.2). Revert to the guest tier
  // WITHOUT resetting `sessionId` or clearing `turns[]`: the thread persists
  // across the user→guest transition exactly as it does across guest→user
  // (BR-A10). Clear lastUsedScope so a later guest new-chat doesn't inherit a
  // signed-in preference.
  const handleSignedOut = useCallback(() => {
    setAuth({ signedIn: false });
    setLastUsedScope(null);
  }, []);

  // Commit each terminal answer exactly once (guard against effect re-runs /
  // React strict-mode double-invoke by tracking the committed object identity).
  const committedAnswerRef = useRef<OakAnswer | null>(null);
  // A team the agent JUST saved (save_team, T13) — set only from a fresh answer
  // so the viewer auto-opens on arrival, never when reloading history.
  const [savedTeamToOpen, setSavedTeamToOpen] = useState<SavedTeam | null>(null);
  useEffect(() => {
    if (status === "done" && answer && committedAnswerRef.current !== answer) {
      committedAnswerRef.current = answer;
      setTurns((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", answer },
      ]);
      if (answer.saved_team) setSavedTeamToOpen(answer.saved_team);
      // Signed in: the server just persisted this turn (creating the
      // conversation on the first turn, or bumping it to the top on a
      // follow-up). Re-list so the sidebar reflects the new title / ordering.
      if (auth.signedIn) refreshConversations();
    }
  }, [status, answer, auth.signedIn, refreshConversations]);

  const handleSend = useCallback(
    (message: string, images: PendingImage[] = []) => {
      // Ignore sends while a turn is in flight. The composer is already disabled
      // then, but a follow-up affordance on an EARLIER answer card (suggestion
      // chip / question option / "Show all") could otherwise fire this, which
      // would abort the in-flight stream and leave its user bubble answer-less
      // (U2). The answer-card chips are also disabled while streaming; this is
      // the single-choke-point backstop covering every follow-up path.
      if (status === "thinking") return;
      requestStartRef.current = Date.now();
      inFlightMessageRef.current = message;
      const userTurnId = makeId();
      setTurns((prev) => [
        ...prev,
        { id: userTurnId, role: "user", content: message },
      ]);
      // Stash the thumbnails in a session-only side-channel keyed by turn id, so
      // the user bubble can show what they sent without putting (large, transient)
      // image data on the ChatTurn itself — keeping history/import payloads text.
      if (images.length > 0) {
        setImagePreviews((prev) => ({
          ...prev,
          [userTurnId]: images.map((img) => img.previewUrl),
        }));
      }
      committedAnswerRef.current = null;
      const body = {
        session_id: sessionId,
        message,
        // An explicit chip pick rides as this turn's seed; omitted once the
        // server has acknowledged a turn (the `scope` effect above clears it).
        ...(scopeSeed ? { scope_seed: scopeSeed } : {}),
        // Wire-only image fields (mimeType + raw base64); the preview URLs stay
        // client-side. Omitted entirely for a text-only turn.
        ...(images.length > 0
          ? { images: images.map((img) => ({ mimeType: img.mimeType, data: img.data })) }
          : {}),
      };
      send(body);
    },
    [send, sessionId, scopeSeed, status],
  );

  // Start a brand-new conversation (AC-6.1): a fresh session id + empty thread.
  // No DB row is created until the first successful turn. The previous
  // conversation remains saved + unchanged. Resolved/seed clear so the chip
  // falls through to lastUsedScope (signed-in preference) or national-dex
  // (guest / never-chatted). lastUsedScope is intentionally kept.
  const handleNewChat = useCallback(() => {
    reset();
    committedAnswerRef.current = null;
    setSessionId(makeId());
    setTurns([]);
    setImagePreviews({});
    setResolvedScope(null);
    setScopeSeed(null);
  }, [reset]);

  // Open a saved conversation (HIST-US-4): load its full-fidelity turns, make it
  // the live thread (its id becomes the session id, so the composer continues
  // it), and follow its stored format (AC-5.4).
  const handleOpenConversation = useCallback(
    (id: string) => {
      void getConversation(id).then((detail) => {
        if (!detail) return;
        // Detach from whatever thread was on screen — a pure unsubscribe now
        // (durable turns keep generating server-side; §6.1). Its pending pointer
        // survives in `pendingTurnsRef` so it can be reattached later.
        reset();
        committedAnswerRef.current = null;
        setSessionId(detail.id);
        setTurns(detail.turns);
        setImagePreviews({}); // session-only thumbnails don't survive a reload
        // Follow the conversation's stored scope so the chip + artifact scope
        // reflect it immediately, before the first resumed turn re-emits `scope`.
        setResolvedScope(detail.format as Format);
        setScopeSeed(null);
        // Reopening mid-generation: reattach to the still-running turn and
        // rebuild the in-flight UI from the server's replay (§6.1). `active_turn`
        // from the conversation GET is authoritative (survives an app relaunch);
        // fall back to the same-session pending pointer if the GET didn't carry
        // one. A finished turn is already in `detail.turns`, and the server
        // returns `active_turn: null` for it — so there is no double-render.
        const resumeTurnId =
          detail.active_turn?.turn_id ?? pendingTurnsRef.current.get(detail.id);
        if (resumeTurnId) resume(resumeTurnId, detail.id);
      });
    },
    [reset, resume],
  );

  // Delete a conversation (HIST-US-8). If it is the one currently on screen,
  // reset to a fresh empty chat so we never show a broken/empty thread (AC-8.2).
  const handleDeleteConversation = useCallback(
    (id: string) => {
      void removeConversation(id);
      if (id === sessionId) handleNewChat();
    },
    [removeConversation, sessionId, handleNewChat],
  );

  // Stop the in-flight turn. With durable turns, stopping is an EXPLICIT API call
  // (background-turns/design.md §6/BT-4): `stop()` POSTs the stop endpoint and
  // tears down the local stream to idle (a disconnect no longer halts generation
  // — only this does). Clear the conversation's pending pointer since the turn is
  // discarded server-side. If stopped within QUICK_STOP_MS, wipe the conversation
  // to a brand-new session and restore the message into the composer for an easy
  // redo; otherwise leave the (now answer-less) turn in the thread.
  const handleStop = useCallback(() => {
    const elapsed = Date.now() - requestStartRef.current;
    stop();
    pendingTurnsRef.current.delete(sessionId);
    committedAnswerRef.current = null;
    if (elapsed < QUICK_STOP_MS) {
      setTurns([]);
      setImagePreviews({});
      setSessionId(makeId());
      setPrefill({ text: inFlightMessageRef.current });
    }
  }, [stop, sessionId]);

  const chatStatus: ChatStatus =
    status === "thinking" ? "streaming" : status === "error" ? "error" : "idle";

  // Empty state = no committed turns and nothing in flight. On desktop the
  // composer is promoted into the hero then (screen 01); on mobile, or once a
  // turn exists, it stays bottom-docked. `heroComposer` decides which of the two
  // DOM slots renders the SINGLE composer instance.
  const showEmptyState = turns.length === 0 && chatStatus === "idle";
  const heroComposer = showEmptyState && !narrow;

  // The scope in effect for the conversation: an explicit chip pick, else the
  // server-resolved scope once a turn has run (GS-C), else the signed-in
  // last-used preference (new-chat default), else national-dex. Drives BOTH
  // the header scope chip and the artifact viewer (B-4) — the viewer snapshots
  // this onto each artifact at open (BR-AV-7).
  const displayFormat: Format =
    scopeSeed ?? resolvedScope ?? lastUsedScope ?? "national-dex";

  // Mic button tapped. Signed in → open the voice overlay at the current
  // display scope; guest → the sign-in dialog (the existing signed-in gate).
  const handleVoiceClick = useCallback(() => {
    if (!auth.signedIn) {
      setAuthDialogOpen(true);
      return;
    }
    setVoiceOpen(true);
  }, [auth.signedIn]);

  // Overlay closed. Voice turns were persisted server-side during the session,
  // so reload the thread (and re-list conversations) — the same refresh path a
  // normal answer triggers — so the spoken turns appear in the chat.
  const handleVoiceClose = useCallback(() => {
    setVoiceOpen(false);
    if (auth.signedIn) {
      void getConversation(sessionId).then((detail) => {
        if (detail) setTurns(detail.turns);
      });
      refreshConversations();
    }
  }, [auth.signedIn, sessionId, refreshConversations]);

  // The single composer element, placed in either the hero slot or the bottom
  // dock (never both) — see `heroComposer` at the render site.
  const composer = (
    <Composer
      onSend={handleSend}
      disabled={status === "thinking"}
      streaming={status === "thinking"}
      onStop={handleStop}
      prefill={prefill}
      onVoice={handleVoiceClick}
      voiceReady={auth.signedIn}
    />
  );

  // Header overflow menu (mobile): below 640px the secondary controls (theme +
  // the signed-in team controls) collapse behind a single gear button so they
  // stop overflowing the red band off-screen. Desktop renders them inline and
  // never shows the gear. Close on outside-tap / Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const headerClusterRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!headerClusterRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        // Return focus to the trigger — the focused control inside the panel is
        // about to be display:none'd, which would otherwise drop focus to <body>.
        moreBtnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Mobile history drawer is a modal overlay (covers the chat behind a scrim), so
  // let Escape dismiss it too — parity with the popover + artifact viewer. Uses
  // the NON-persisting setter + a viewport guard so it never collapses the
  // in-flow desktop sidebar or clobbers the stored desktop preference.
  useEffect(() => {
    if (sidebarCollapsed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (window.matchMedia?.("(max-width: 768px)").matches ?? false)
      ) {
        setSidebarCollapsed(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarCollapsed]);

  return (
    <main className="chat-page" data-testid="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__title-cluster">
          <SidebarToggle
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsedPersisted(!sidebarCollapsed)}
            controlsId={SIDEBAR_ID}
          />
          <button
            type="button"
            className="chat-page__title"
            aria-label="Oak — reload"
            onClick={() => window.location.reload()}
          >
            Oak
          </button>
        </div>
        <div className="chat-page__header-cluster" ref={headerClusterRef}>
          {/* The scope control (GS-C). Rendered OUTSIDE the collapsible controls
              so it stays visible on mobile — both the server's resolved scope
              (e.g. a "gen 7" message overriding a chip pick) and the control to
              change it must be surfaced, not hidden behind the gear. */}
          <ScopeChip
            format={displayFormat}
            onSelect={setScopeSeed}
            disabled={status === "thinking"}
          />
          {/* Collapsible group: inline on desktop, a popover under the gear on
              mobile (≤640px). Holds the secondary controls AND the auth control
              (AuthMenu) — the auth pill (guest "Sign in" or the wider signed-in
              email/"Sign out" cluster) was the element overflowing the 390/360px
              header, so it collapses into the gear popover on mobile too. Mobile
              header = logo + scope chip + gear; desktop is unchanged (this group
              is inline there, in the same visual order as before). */}
          <div
            id="header-controls"
            className={
              "chat-page__controls" +
              (menuOpen ? " chat-page__controls--open" : "")
            }
          >
            <ThemeToggle />
            <AuthMenu
              signedIn={auth.signedIn}
              email={auth.email}
              onSignInClick={() => setAuthDialogOpen(true)}
              onSignedOut={handleSignedOut}
            />
          </div>
          {/* Mobile-only trigger for the control popover (CSS hides it ≥640px). */}
          <button
            ref={moreBtnRef}
            type="button"
            className="chat-page__more"
            aria-label="More settings"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="header-controls"
            data-testid="header-more"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <SlidersIcon />
          </button>
        </div>
      </header>

      <div className="chat-page__body">
        <ArtifactViewerProvider format={displayFormat}>
          {/* App rail — visible to everyone (nav refactor Part 1): New chat +
              Teams + a quiet Reference footer for all users, with the
              signed-in conversation list (or a guest sign-in hint) in the
              middle slot. Collapses to width 0 via the toggle; the inner
              wrapper keeps its fixed width so content doesn't reflow
              mid-slide, and goes `inert` when collapsed so its controls leave
              the tab + a11y trees. `railBoot` suppresses the collapse
              transition until the mount-resolution effect above has run, so a
              mobile correction from the SSR-expanded default can't flash. */}
          <aside
            id={SIDEBAR_ID}
            data-testid="history-sidebar"
            className={
              "chat-page__sidebar" +
              (sidebarCollapsed ? " chat-page__sidebar--collapsed" : "") +
              (railBoot ? " chat-page__sidebar--boot" : "")
            }
          >
            <div
              className="chat-page__sidebar-inner"
              inert={sidebarCollapsed ? true : undefined}
            >
              <AppNav pathname="/" onNewChat={handleNewChat}>
                {auth.signedIn ? (
                  <ConversationList
                    conversations={conversations.conversations}
                    activeId={sessionId}
                    query={conversations.query}
                    onQueryChange={conversations.setQuery}
                    onNewChat={handleNewChat}
                    onOpen={handleOpenConversation}
                    onRename={conversations.rename}
                    onPin={conversations.pin}
                    onDelete={handleDeleteConversation}
                  />
                ) : (
                  <div
                    className="chat-page__signin-hint"
                    data-testid="history-signin-hint"
                  >
                    <p className="chat-page__signin-hint-text">
                      Sign in to save chat history
                    </p>
                    <button
                      type="button"
                      className="chat-page__signin-hint-cta"
                      onClick={() => setAuthDialogOpen(true)}
                    >
                      Sign in
                    </button>
                  </div>
                )}
              </AppNav>
            </div>
          </aside>

          {/* Mobile drawer scrim: tap to dismiss the app rail. Only rendered
              when the drawer is open; CSS shows it as a full-screen overlay
              below 768px and hides it on desktop (where the rail is an
              in-flow column, not an overlay). */}
          {!sidebarCollapsed && (
            <div
              className="chat-page__scrim"
              data-testid="sidebar-scrim"
              aria-hidden="true"
              // Non-persisting: dismissing the mobile overlay must not overwrite
              // the stored DESKTOP sidebar preference (mount force-collapses on
              // mobile without persisting for the same reason).
              onClick={() => setSidebarCollapsed(true)}
            />
          )}

          <div className="chat-page__main">
            <ChatThread
              turns={turns}
              activity={activities}
              status={chatStatus}
              streamingMarkdown={streamingMarkdown}
              transportError={status === "error" ? error : null}
              reconnecting={reconnecting}
              onRetry={retry}
              onFollowUp={handleSend}
              imagePreviews={imagePreviews}
              // The composer is a single instance rendered in exactly one of two
              // slots: the empty-state hero (desktop) here, or bottom-docked
              // below. `heroComposer` is the sole switch, so it never mounts twice.
              composerSlot={heroComposer ? composer : undefined}
              scopeChipSlot={
                heroComposer ? (
                  <ScopeChip
                    format={displayFormat}
                    onSelect={setScopeSeed}
                    disabled={status === "thinking"}
                    testId="scope-chip-hero"
                  />
                ) : undefined
              }
            />

            {showEmptyState && <LandingSection />}

            {!heroComposer && composer}
          </div>

          {/* Headless: auto-opens a just-saved team in the viewer on arrival. */}
          <SavedTeamAutoOpen savedTeam={savedTeamToOpen} />

          {/* Docked side panel (full-screen overlay on mobile); hidden until an
              artifact is opened, at which point the chat reflows (AV-US-7). */}
          <ArtifactViewer />
        </ArtifactViewerProvider>
      </div>

      <AuthDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
        onSignedIn={handleSignedIn}
      />

      {/* Voice mode (signed-in only) — opens at the current display scope; on
          close the thread reloads so persisted spoken turns appear. */}
      <VoiceOverlay
        open={voiceOpen}
        onClose={handleVoiceClose}
        sessionId={sessionId}
        format={displayFormat}
      />
    </main>
  );
}

/** Sliders / settings glyph for the mobile header overflow trigger. */
function SlidersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx={16} cy={6} r={2} />
      <circle cx={8} cy={12} r={2} />
      <circle cx={16} cy={18} r={2} />
    </svg>
  );
}
