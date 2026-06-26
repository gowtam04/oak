"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSseClient } from "@/lib/sse-client";
import ChatThread from "@/components/ChatThread";
import Composer from "@/components/Composer";
import ThemeToggle from "@/components/ThemeToggle";
import type { ChatStatus, ChatTurn, PokebotAnswer } from "@/components/types";

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
  const [sessionId] = useState<string>(() => makeId());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const { status, activities, answer, error, send } = useSseClient();

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
      setTurns((prev) => [
        ...prev,
        { id: makeId(), role: "user", content: message },
      ]);
      committedAnswerRef.current = null;
      send({ session_id: sessionId, message });
    },
    [send, sessionId],
  );

  const chatStatus: ChatStatus =
    status === "thinking" ? "streaming" : status === "error" ? "error" : "idle";

  return (
    <main className="chat-page" data-testid="chat-page">
      <header className="chat-page__header">
        <h1 className="chat-page__title">Pokebot</h1>
        <ThemeToggle />
      </header>

      <ChatThread
        turns={turns}
        activity={activities}
        status={chatStatus}
        transportError={status === "error" ? error : null}
        onFollowUp={handleSend}
      />

      <Composer onSend={handleSend} disabled={status === "thinking"} />
    </main>
  );
}
