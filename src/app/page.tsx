"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSseClient } from "@/lib/sse-client";
import ChatThread from "@/components/ChatThread";
import Composer from "@/components/Composer";
import ThemeToggle from "@/components/ThemeToggle";
import ChampionsToggle from "@/components/ChampionsToggle";
import AuthMenu from "@/components/auth/AuthMenu";
import AuthDialog from "@/components/auth/AuthDialog";
import { fetchMe, type MeResult } from "@/lib/auth-client";
import type { ChatStatus, ChatTurn, PokebotAnswer } from "@/components/types";

/** localStorage key for the persisted Champions-mode choice. */
const CHAMPIONS_STORAGE_KEY = "pokebot-champions-mode";

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
 * Home — the Pokebot chat page (design.md § Phase 7).
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
  const { status, activities, answer, streamingMarkdown, error, send, reset } =
    useSseClient();

  // Track the active request so Stop can decide between a quick-stop reset and a
  // plain stop, and restore the stopped message into the composer.
  const requestStartRef = useRef<number>(0);
  const inFlightMessageRef = useRef<string>("");
  // A fresh object pushed into the Composer to reload its input after a quick
  // stop (identity change is what triggers the reload).
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  // Champions mode: server-controlled scope sent on every request as
  // `champions_mode`. Resolve from localStorage only AFTER mount so the SSR
  // markup stays stable (mirrors ThemeToggle's `getInitialTheme` + mounted
  // guard) and we avoid a hydration mismatch.
  const [championsMode, setChampionsMode] = useState(false);
  useEffect(() => {
    try {
      setChampionsMode(
        localStorage.getItem(CHAMPIONS_STORAGE_KEY) === "true",
      );
    } catch {
      /* storage unavailable (private mode) — keep the default (off) */
    }
  }, []);

  const setChampionsModePersisted = useCallback((next: boolean) => {
    setChampionsMode(next);
    try {
      localStorage.setItem(CHAMPIONS_STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable (private mode) — fall back to in-session only */
    }
  }, []);

  // Auth identity (account-creation design.md § API "/api/auth/me"; AUTH-US-1 /
  // AC-1.2). Auth is a SEPARATE concern from the conversation: it lives in a
  // cookie/account, never in `sessionId`/`turns[]`, so signing in or out must
  // leave the on-screen thread untouched (BR-A10 / AUTH-US-6 — enforced below).
  const [auth, setAuth] = useState<MeResult>({ signedIn: false });
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  // Resolve auth state on mount so the header renders guest vs signed-in. The
  // page is a client component, so this runs after hydration; `fetchMe` never
  // throws (a guest / unknown cookie / transport fault all resolve to
  // `{ signedIn: false }`), so no error path is needed (BR-A11).
  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (active) setAuth(me);
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
    void fetchMe().then(setAuth);
  }, []);

  // Sign-out completed (current device only — AC-5.2). Revert to the guest tier
  // WITHOUT resetting `sessionId` or clearing `turns[]`: the thread persists
  // across the user→guest transition exactly as it does across guest→user
  // (BR-A10).
  const handleSignedOut = useCallback(() => {
    setAuth({ signedIn: false });
  }, []);

  // Commit each terminal answer exactly once (guard against effect re-runs /
  // React strict-mode double-invoke by tracking the committed object identity).
  const committedAnswerRef = useRef<PokebotAnswer | null>(null);
  useEffect(() => {
    if (status === "done" && answer && committedAnswerRef.current !== answer) {
      committedAnswerRef.current = answer;
      setTurns((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", answer },
      ]);
    }
  }, [status, answer]);

  const handleSend = useCallback(
    (message: string) => {
      requestStartRef.current = Date.now();
      inFlightMessageRef.current = message;
      setTurns((prev) => [
        ...prev,
        { id: makeId(), role: "user", content: message },
      ]);
      committedAnswerRef.current = null;
      send({ session_id: sessionId, message, champions_mode: championsMode });
    },
    [send, sessionId, championsMode],
  );

  // Stop the in-flight turn. `reset()` aborts the fetch (which propagates to the
  // server, halting generation) and returns the SSE hook to idle. If the request
  // was stopped within QUICK_STOP_MS, wipe the conversation to a brand-new
  // session and restore the message into the composer for an easy redo;
  // otherwise leave the (now answer-less) turn in the thread.
  const handleStop = useCallback(() => {
    const elapsed = Date.now() - requestStartRef.current;
    reset();
    committedAnswerRef.current = null;
    if (elapsed < QUICK_STOP_MS) {
      setTurns([]);
      setSessionId(makeId());
      setPrefill({ text: inFlightMessageRef.current });
    }
  }, [reset]);

  const chatStatus: ChatStatus =
    status === "thinking" ? "streaming" : status === "error" ? "error" : "idle";

  return (
    <main className="chat-page" data-testid="chat-page">
      <header className="chat-page__header">
        <h1 className="chat-page__title">Pokebot</h1>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <ChampionsToggle
            checked={championsMode}
            onChange={setChampionsModePersisted}
          />
          <ThemeToggle />
          <AuthMenu
            signedIn={auth.signedIn}
            email={auth.email}
            onSignInClick={() => setAuthDialogOpen(true)}
            onSignedOut={handleSignedOut}
          />
        </div>
      </header>

      <ChatThread
        turns={turns}
        activity={activities}
        status={chatStatus}
        streamingMarkdown={streamingMarkdown}
        transportError={status === "error" ? error : null}
        onFollowUp={handleSend}
      />

      <Composer
        onSend={handleSend}
        disabled={status === "thinking"}
        streaming={status === "thinking"}
        onStop={handleStop}
        prefill={prefill}
      />

      <AuthDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
        onSignedIn={handleSignedIn}
      />
    </main>
  );
}
