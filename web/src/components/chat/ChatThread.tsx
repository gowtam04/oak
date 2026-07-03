"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatThreadProps } from "@/components/types";
import type { ToolActivityEvent } from "@/lib/sse/sse-types";
import AnswerCard from "@/components/answer-card/AnswerCard";
import Markdown from "@/components/Markdown";
import { STARTER_PROMPTS, pickRandomPrompts } from "@/lib/example-prompts";
import { CHAMPIONS_REGULATION } from "@/data/formats";

/**
 * The tool_activity label carries a leading status emoji (🔍/📊/…) as its own
 * decoration. A field-note chip renders its own spinner/tick glyph instead, so we
 * strip the leading pictographic run (emoji + optional variation selector / ZWJ
 * sequence) and let the mono tool token carry the "which tool" signal. Falls back
 * to the raw label if stripping would empty it.
 */
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍]+\s*/u;
function noteDescription(label: string): string {
  return label.replace(EMOJI_PREFIX, "").trimStart() || label;
}

/**
 * One "field note" chip in the streaming trail: the mono instrument token derived
 * from the tool name (`GET_POKEMON`) beside the human-readable subject, with a
 * pokeball micro-spinner while in flight (the latest, unfinished call) or a tick
 * once the loop has moved on. Presentation only — data comes straight from the
 * `tool_activity` SSE payload the client already accumulates.
 */
function FieldNote({
  activity,
  state,
}: {
  activity: ToolActivityEvent;
  state: "active" | "done";
}) {
  return (
    <li
      className={`chat-thread__note chat-thread__note--${state}`}
      data-testid="field-note"
    >
      <span
        className="chat-thread__note-glyph"
        data-state={state}
        aria-hidden="true"
      />
      <span className="ilabel chat-thread__note-tool">
        {activity.tool.toUpperCase()}
      </span>
      <span className="chat-thread__note-desc">
        {noteDescription(activity.label)}
      </span>
    </li>
  );
}

/**
 * ChatThread — renders the committed conversation (user + assistant turns) in
 * order, plus the streaming "field notes" experience while `status ===
 * "streaming"` (fable-ui-strategy §4 screen 03):
 *   - a vertical trail of instrument chips, one per accumulated `tool_activity`
 *     event (mono tool token + subject); the latest carries the pokeball micro-
 *     spinner, completed ones a tick. Before the first tool it's a single
 *     "thinking" chip; a live elapsed-seconds counter sits below, in mono.
 *   - an answer-card skeleton (masthead bar + prose lines, soft pulse) shown the
 *     instant a turn starts, holding the layout so real content doesn't jump in.
 *   - once prose begins streaming (`answer_start`), the trail collapses to one
 *     compact summary chip ("6 lookups · 12s") pinned above the streaming card,
 *     re-expandable to the full trail — continuity, not deletion.
 *   - a transport-fault affordance when `status === "error"` and
 *     `transportError` is set (in-domain failures arrive as normal answer cards,
 *     never here — sse-client.ts / integration.md); it replaces the skeleton in
 *     place, no layout jump.
 *
 * Each assistant turn is rendered through `AnswerCard`, with `onFollowUp`
 * threaded down so suggestion-chip / candidate-row clicks POST a follow-up turn
 * on the same session. Visual styling deferred to the `frontend-design` skill.
 */
export default function ChatThread({
  turns,
  activity,
  status,
  streamingMarkdown,
  transportError,
  reconnecting = false,
  onRetry,
  onFollowUp,
  imagePreviews,
}: ChatThreadProps) {
  const showEmptyState = turns.length === 0 && status === "idle";

  // Empty-state starter chips: show a fresh random 4 each time the empty state
  // appears (page load, or returning to it after a "new chat" resets `turns`),
  // so a user discovers Oak's full range over repeated visits. The initial value
  // is the deterministic first-4 so the server render and first client render
  // match (this is a Client Component — `Math.random()` at render time would
  // hydration-mismatch); the post-mount effect then swaps in the random set.
  const [examples, setExamples] = useState<string[]>(() =>
    STARTER_PROMPTS.slice(0, 4),
  );
  useEffect(() => {
    if (showEmptyState) setExamples(pickRandomPrompts(4));
  }, [showEmptyState]);

  // Auto-scroll to the newest content (new turn / streamed token) — important on
  // a phone where the composer occupies a big share of the screen, so a fresh
  // answer lands below the fold. Only follow when the user is pinned to the
  // bottom; if they've scrolled up to read, we don't yank them back down.
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastTopRef = useRef(0);
  const lastTurnIdRef = useRef<string | null>(null);
  useEffect(() => {
    const scroller = bottomRef.current?.closest(
      ".chat-page__main",
    ) as HTMLElement | null;
    if (!scroller) return;
    const onScroll = () => {
      // Direction-aware: only an UPWARD user scroll un-pins; reaching the bottom
      // re-pins. A plain distance check would flip off mid-stream because our own
      // programmatic follow lags behind fast-growing content, stalling auto-scroll.
      const atBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
      if (scroller.scrollTop < lastTopRef.current - 8) pinnedRef.current = false;
      else if (atBottom) pinnedRef.current = true;
      lastTopRef.current = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const lastTurn = turns[turns.length - 1];
    // A newly-appended USER turn means the user just sent input (typed or via a
    // suggestion/example button). Always snap to the bottom so they see it enter —
    // even if they'd scrolled up to read. Streaming + assistant updates below still
    // respect pinning, so scrolling up mid-turn to read isn't yanked back.
    if (lastTurn?.role === "user" && lastTurn.id !== lastTurnIdRef.current) {
      pinnedRef.current = true;
    }
    lastTurnIdRef.current = lastTurn?.id ?? null;
    // Optional-call: scrollIntoView is absent in jsdom (tests) — no-op there.
    if (pinnedRef.current) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, streamingMarkdown, status]);

  // Liveness heartbeat: while the turn is in flight, count wall-clock seconds so
  // a slow turn (long model "thinking" before the first tool, or while composing)
  // visibly keeps moving instead of reading as stuck. Computed from a start
  // timestamp rather than incremented, so a throttled/backgrounded tab stays
  // accurate. Resets whenever the turn ends.
  // Also restart when a reconnect begins/ends so the counter measures the
  // current attempt, not the cumulative wall-clock across a suspended gap (which
  // would read as "stuck").
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (status !== "streaming") {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status, reconnecting]);

  // Once prose streams, the trail collapses to a summary chip; the user can
  // re-expand it to re-show every field note. Reset the toggle whenever the turn
  // ends so the next turn starts collapsed.
  const [trailExpanded, setTrailExpanded] = useState(false);
  useEffect(() => {
    if (status !== "streaming") setTrailExpanded(false);
  }, [status]);

  // The field-notes trail: while working (no prose yet) it's shown in full with
  // the latest chip live-spinning; once prose streams it collapses. Before the
  // first tool lands there are no activities — a lone "thinking" chip stands in.
  const hasActivity = activity.length > 0;
  const lastIndex = activity.length - 1;
  const collapsed = Boolean(streamingMarkdown);
  const lookupCount = activity.length;
  const thinkingLabel = reconnecting
    ? "Reconnecting…"
    : "Thinking through your question…";

  return (
    <div className="chat-thread" data-testid="chat-thread">
      {showEmptyState && (
        <div className="chat-empty" data-testid="chat-empty">
          <span className="chat-empty__wordmark">Oak</span>
          <p className="chat-empty__invite">
            Ask anything about Pokémon — team-building filters, stat math, damage
            calcs, or a quick Pokédex lookup.
          </p>
          <p className="chat-empty__scope-hint" data-testid="chat-empty-scope-hint">
            Answers default to Pokémon Champions ({CHAMPIONS_REGULATION}). For mainline
            games, mention one (&ldquo;in Scarlet/Violet&rdquo;, &ldquo;gen 7&rdquo;) or use the scope chip in
            the header.
          </p>
          <div className="chat-empty__examples">
            {examples.map((query) => (
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
            {imagePreviews?.[turn.id]?.length ? (
              <div
                className="chat-turn__images"
                data-testid="user-turn-images"
              >
                {imagePreviews[turn.id]!.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    className="chat-turn__image"
                    src={url}
                    alt="Attached image"
                  />
                ))}
              </div>
            ) : null}
            {turn.content ? (
              <div className="chat-turn__content">{turn.content}</div>
            ) : null}
          </div>
        ) : (
          <div
            key={turn.id}
            className="chat-turn chat-turn--assistant"
            data-testid="assistant-turn"
          >
            <AnswerCard
              answer={turn.answer}
              onFollowUp={onFollowUp}
              disabled={status === "streaming"}
            />
          </div>
        ),
      )}

      {status === "streaming" && (
        <div className="chat-thread__progress" data-testid="progress">
          {collapsed ? (
            // Prose is streaming — the trail folds into one summary chip pinned
            // above the answer, re-expandable to the full field-notes trail.
            hasActivity && (
              <div className="chat-thread__trail chat-thread__trail--collapsed">
                <button
                  type="button"
                  className="chat-thread__summary"
                  data-testid="trail-summary"
                  aria-expanded={trailExpanded}
                  onClick={() => setTrailExpanded((v) => !v)}
                >
                  <span
                    className="chat-thread__note-glyph"
                    data-state="done"
                    aria-hidden="true"
                  />
                  <span className="ilabel chat-thread__summary-count">
                    {lookupCount} {lookupCount === 1 ? "lookup" : "lookups"}
                  </span>
                  <span className="chat-thread__summary-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="mono-num chat-thread__summary-time">
                    {elapsedSeconds}s
                  </span>
                  <span
                    className="chat-thread__summary-caret"
                    data-open={trailExpanded}
                    aria-hidden="true"
                  />
                </button>
                {trailExpanded && (
                  <ol
                    className="chat-thread__notes chat-thread__notes--batch"
                    data-testid="trail-full"
                  >
                    {activity.map((a, i) => (
                      <FieldNote key={i} activity={a} state="done" />
                    ))}
                  </ol>
                )}
              </div>
            )
          ) : (
            // Still working — the live trail. Latest chip spins; the rest tick.
            <div className="chat-thread__trail">
              {hasActivity ? (
                <ol
                  className="chat-thread__notes"
                  data-testid="trail-full"
                  aria-live="polite"
                >
                  {activity.map((a, i) => (
                    <FieldNote
                      key={i}
                      activity={a}
                      state={
                        !reconnecting && i === lastIndex ? "active" : "done"
                      }
                    />
                  ))}
                </ol>
              ) : (
                <p
                  className="chat-thread__note chat-thread__note--active chat-thread__note--thinking"
                  data-testid="progress-thinking"
                  aria-live="polite"
                >
                  <span
                    className="chat-thread__note-glyph"
                    data-state="active"
                    aria-hidden="true"
                  />
                  <span className="chat-thread__note-desc">
                    {thinkingLabel}
                  </span>
                </p>
              )}
              {elapsedSeconds >= 3 && (
                <span
                  className="chat-thread__elapsed mono-num"
                  data-testid="progress-elapsed"
                  aria-hidden="true"
                >
                  {elapsedSeconds}s
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Answer skeleton — shown the instant a turn starts (before prose), so the
          shape of what's coming holds the layout and the streamed answer (or the
          error strip) replaces it in place with no jump. */}
      {status === "streaming" && !streamingMarkdown && (
        <div
          className="chat-turn chat-turn--assistant chat-thread__skeleton"
          data-testid="answer-skeleton"
          aria-hidden="true"
        >
          <div className="chat-thread__skeleton-masthead" />
          <div className="chat-thread__skeleton-line" />
          <div className="chat-thread__skeleton-line" />
          <div className="chat-thread__skeleton-line chat-thread__skeleton-line--short" />
        </div>
      )}

      {status === "streaming" && streamingMarkdown && (
        <div
          className="chat-turn chat-turn--assistant chat-thread__streaming"
          data-testid="streaming-answer"
          aria-live="polite"
        >
          <Markdown markdown={streamingMarkdown} />
        </div>
      )}

      {status === "error" && transportError && (
        <div
          className="chat-thread__error"
          data-testid="transport-error"
          role="alert"
        >
          <span className="chat-thread__error-text">
            Something went wrong ({transportError.code}). Please try again.
          </span>
          {onRetry && (
            <button
              type="button"
              className="chat-thread__error-retry"
              data-testid="transport-error-retry"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Scroll anchor for auto-follow (kept at the very bottom of the thread). */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
