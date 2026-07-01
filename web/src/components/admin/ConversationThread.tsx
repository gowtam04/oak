"use client";

import type { OakAnswer } from "@/components/types";
import type {
  ConversationThreadResponse,
  StoredTurn,
} from "@/lib/admin/admin-types";
import AnswerCard from "@/components/answer-card/AnswerCard";

/**
 * ConversationThread — the render half of the admin Conversation thread reader
 * (`/admin/conversations/[id]`, ADMIN-US-9 / ADMIN-AC-9.2). Given one
 * `ConversationThreadResponse` (`{ summary, turns }` from
 * `GET /api/admin/conversations/[id]`), it renders the full thread for READING:
 *
 *   - A summary header — title, owning account (ADMIN-BR-4 owner-only
 *     cross-account read access), format, message count, created/updated.
 *   - The stored turns in `seq` order. A `user` turn renders its plain message
 *     text; an `assistant` turn RE-RENDERS its stored `answer_json` through the
 *     real {@link AnswerCard}, so the operator sees exactly what the user saw,
 *     falling back to the stored text / a note when the JSON is missing or
 *     malformed.
 *
 * READ-ONLY (ADMIN-AC-9.3 / ADMIN-BR-2): this view never deletes, edits,
 * redacts, or flags a conversation or message. `AnswerCard` is rendered WITHOUT
 * an `onFollowUp` handler, so its interactive leaves (suggestions, candidate
 * rows) are inert no-ops here — they cannot start a chat turn from the panel.
 *
 * Like the other admin views it is PURE + CONTROLLED (the component-test rule):
 * the owning thin page (`app/admin/conversations/[id]/page.tsx`) owns the
 * `fetch` orchestration and passes the resolved `thread` (or the loading /
 * notFound / error flags) in as props, so this screen renders identically from
 * fixtures in jsdom and imports no db/repos/runtime.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5,
 *     § API Design (`GET /api/admin/conversations/{id} →
 *     ConversationThreadResponse`), § Implementation Phases Phase 8.
 *   - requirements.md ADMIN-US-9, ADMIN-AC-9.2/9.3, ADMIN-BR-2/4.
 */

export interface ConversationThreadProps {
  /** The resolved thread, or null while loading / not found / errored. */
  thread: ConversationThreadResponse | null;
  /** True while the thread fetch is in flight. */
  loading?: boolean;
  /** True when the id resolved to a 404 (no such conversation). */
  notFound?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** Where the "back" link points (defaults to the Conversations browser). */
  backHref?: string;
}

/** Human-readable label for a stored conversation format (matches the team UI). */
function formatLabel(format: string): string {
  if (format === "champions") return "Champions";
  if (format === "scarlet-violet") return "Scarlet/Violet";
  return format;
}

/** epoch-ms → local datetime; tolerant of a 0/NaN value. */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString();
}

/**
 * Parse a stored `answer_json` into an `OakAnswer` for re-render. Returns null
 * when the column is null (user rows) or the JSON is malformed / not a
 * recognizable answer payload. No Zod validation here — a light structural guard
 * (object with a string `answer_markdown`) keeps this client-side and avoids
 * crashing `AnswerCard` on a stray shape (mirrors `TurnDetail`).
 */
function parseAnswerJson(answerJson: string | null): OakAnswer | null {
  if (answerJson == null) return null;
  try {
    const parsed: unknown = JSON.parse(answerJson);
    if (
      parsed != null &&
      typeof parsed === "object" &&
      typeof (parsed as { answer_markdown?: unknown }).answer_markdown ===
        "string"
    ) {
      return parsed as OakAnswer;
    }
    return null;
  } catch {
    return null;
  }
}

/** One turn within the thread: a user message or an assistant answer. */
function ThreadTurn({ turn }: { turn: StoredTurn }) {
  const isAssistant = turn.role === "assistant";
  const answer = isAssistant ? parseAnswerJson(turn.answerJson) : null;
  const hasText = turn.textContent.trim() !== "";

  return (
    <li
      className={`conversation-thread__turn conversation-thread__turn--${turn.role}`}
      data-testid={`thread-turn-${turn.id}`}
      data-role={turn.role}
    >
      <span className="conversation-thread__role" data-testid={`thread-role-${turn.id}`}>
        {isAssistant ? "Oak" : "User"}
      </span>
      <div className="conversation-thread__bubble">
        {isAssistant && answer ? (
          <AnswerCard answer={answer} />
        ) : hasText ? (
          <pre className="conversation-thread__text">{turn.textContent}</pre>
        ) : (
          <p className="conversation-thread__empty">
            {isAssistant ? "(no answer recorded)" : "(empty message)"}
          </p>
        )}
      </div>
    </li>
  );
}

export default function ConversationThread({
  thread,
  loading = false,
  notFound = false,
  error = null,
  backHref = "/admin/conversations",
}: ConversationThreadProps) {
  let body: React.ReactNode;

  if (loading) {
    body = (
      <p
        className="conversation-thread__empty"
        data-testid="conversation-thread-loading"
      >
        Loading conversation…
      </p>
    );
  } else if (notFound) {
    body = (
      <p
        className="conversation-thread__empty"
        data-testid="conversation-thread-not-found"
      >
        Conversation not found.
      </p>
    );
  } else if (error != null && error !== "") {
    body = (
      <p
        className="conversation-thread__empty"
        data-testid="conversation-thread-error"
        role="alert"
      >
        {error}
      </p>
    );
  } else if (thread) {
    const { summary, turns } = thread;
    body = (
      <>
        <header
          className="conversation-thread__summary"
          data-testid="conversation-thread-summary"
        >
          <h2 className="conversation-thread__title" data-testid="conversation-thread-title">
            {summary.title?.trim() ? summary.title : "Untitled conversation"}
          </h2>
          <dl className="conversation-thread__meta">
            <div className="conversation-thread__meta-item">
              <dt>Account</dt>
              <dd data-testid="conversation-thread-account">
                {summary.accountEmail ?? summary.accountId}
              </dd>
            </div>
            <div className="conversation-thread__meta-item">
              <dt>Format</dt>
              <dd data-testid="conversation-thread-format">
                {formatLabel(summary.format)}
              </dd>
            </div>
            <div className="conversation-thread__meta-item">
              <dt>Messages</dt>
              <dd data-testid="conversation-thread-message-count">
                {summary.messageCount}
              </dd>
            </div>
            <div className="conversation-thread__meta-item">
              <dt>Created</dt>
              <dd>{formatTimestamp(summary.createdAt)}</dd>
            </div>
            <div className="conversation-thread__meta-item">
              <dt>Updated</dt>
              <dd>{formatTimestamp(summary.updatedAt)}</dd>
            </div>
          </dl>
        </header>

        {turns.length === 0 ? (
          <p
            className="conversation-thread__empty"
            data-testid="conversation-thread-no-turns"
          >
            This conversation has no messages.
          </p>
        ) : (
          <ol className="conversation-thread__turns" data-testid="conversation-thread-turns">
            {turns.map((turn) => (
              <ThreadTurn key={turn.id} turn={turn} />
            ))}
          </ol>
        )}
      </>
    );
  } else {
    body = (
      <p
        className="conversation-thread__empty"
        data-testid="conversation-thread-empty"
      >
        No conversation to display.
      </p>
    );
  }

  return (
    <section
      className="admin-page conversation-thread"
      data-testid="conversation-thread"
    >
      <a
        href={backHref}
        className="conversation-thread__back"
        data-testid="conversation-thread-back"
      >
        ← Back to conversations
      </a>
      <h1 className="admin-page__title">Conversation</h1>
      {body}
    </section>
  );
}
