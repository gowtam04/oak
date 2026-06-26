"use client";

import type { ChatThreadProps } from "@/components/types";
import AnswerCard from "@/components/AnswerCard";

/** Fresh-session example prompts (design-system.md "Empty state"). */
const EXAMPLE_QUERIES = [
  "Pokémon that learn Trick Room and Will-O-Wisp",
  "Does Fake Out work on Farigiraf?",
  "Fastest Fire types",
  "What's strong against Dragapult?",
];

/**
 * ChatThread — renders the committed conversation (user + assistant turns) in
 * order, plus:
 *   - an in-flight progress indicator while `status === "streaming"`, driven by
 *     the `activity` tool-activity labels (or a generic "Thinking…" before the
 *     first tool_activity event lands), and
 *   - a transport-fault affordance when `status === "error"` and
 *     `transportError` is set (in-domain failures arrive as normal answer cards,
 *     never here — sse-client.ts / integration.md).
 *
 * Each assistant turn is rendered through `AnswerCard`, with `onFollowUp`
 * threaded down so suggestion-chip / candidate-row clicks POST a follow-up turn
 * on the same session. Visual styling deferred to the `frontend-design` skill.
 */
export default function ChatThread({
  turns,
  activity,
  status,
  transportError,
  onFollowUp,
}: ChatThreadProps) {
  const showEmptyState = turns.length === 0 && status === "idle";

  return (
    <div className="chat-thread" data-testid="chat-thread">
      {showEmptyState && (
        <div className="chat-empty" data-testid="chat-empty">
          <span className="chat-empty__wordmark">Pokebot</span>
          <p className="chat-empty__invite">
            Ask anything about Pokémon — team-building filters, stat math, damage
            calcs, or a quick Pokédex lookup.
          </p>
          <div className="chat-empty__examples">
            {EXAMPLE_QUERIES.map((query) => (
              <button
                key={query}
                type="button"
                className="chat-empty__chip"
                onClick={() => onFollowUp(query)}
                data-testid="chat-empty-example"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) =>
        turn.role === "user" ? (
          <div
            key={turn.id}
            className="chat-turn chat-turn--user"
            data-testid="user-turn"
          >
            <div className="chat-turn__content">{turn.content}</div>
          </div>
        ) : (
          <div
            key={turn.id}
            className="chat-turn chat-turn--assistant"
            data-testid="assistant-turn"
          >
            <AnswerCard answer={turn.answer} onFollowUp={onFollowUp} />
          </div>
        ),
      )}

      {status === "streaming" && (
        <div
          className="chat-thread__progress"
          data-testid="progress"
          aria-live="polite"
        >
          {activity.length === 0 ? (
            <span
              className="chat-thread__progress-label"
              data-testid="progress-thinking"
            >
              Thinking…
            </span>
          ) : (
            <ol className="chat-thread__progress-list">
              {activity.map((a, i) => (
                <li
                  key={i}
                  className="chat-thread__progress-item"
                  data-testid={`progress-item-${i}`}
                >
                  {a.label}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {status === "error" && transportError && (
        <div
          className="chat-thread__error"
          data-testid="transport-error"
          role="alert"
        >
          Something went wrong ({transportError.code}). Please try again.
        </div>
      )}
    </div>
  );
}
