"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatThreadProps } from "@/components/types";
import type { ToolActivityEvent } from "@/lib/sse/sse-types";
import AnswerCard from "@/components/answer-card/AnswerCard";
import Markdown from "@/components/Markdown";
import { plateHintFromToolLabels } from "@/lib/plate-types";
import {
  STARTER_ENTRIES,
  pickRandomStarters,
  type StarterPrompt,
} from "@/lib/example-prompts";

/**
 * The tool_activity label carries a leading status emoji (🔍/📊/…) as its own
 * decoration. An instrument-ticker row renders its own spinner/tick glyph instead,
 * so we strip the leading pictographic run (emoji + optional variation selector /
 * ZWJ sequence) and let the mono tool token carry the "which tool" signal. Falls
 * back to the raw label if stripping would empty it.
 */
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍]+\s*/u;
function noteDescription(label: string): string {
  return label.replace(EMOJI_PREFIX, "").trimStart() || label;
}

/**
 * Tool -> friendly instrument word (TestFlight feedback AH1b0N09K — raw wire
 * tool names like `GET_EVOLUTION_CHAIN`/`RUN_SQL` leaked into the streaming
 * chips). Pinned by the canonical cross-platform copy table (§1) — iOS/Android
 * mirror this vocabulary exactly. `.ilabel` uppercases visually via CSS
 * (`text-transform: uppercase`), so the map stores natural case.
 */
const INSTRUMENT_TOKENS: Record<string, string> = {
  resolve_entity: "Dex lookup",
  query_pokedex: "Pokédex search",
  get_pokemon: "Pokémon",
  get_move: "Move",
  get_ability: "Ability",
  get_item: "Item",
  get_type_matchups: "Type matchups",
  get_evolution_chain: "Evolution",
  compute_stat: "Stats",
  estimate_damage: "Damage calc",
  get_usage_stats: "Usage",
  get_meta_usage: "Usage",
  get_encounters: "Locations",
  get_learnset: "Movepool",
  get_team: "Teams",
  list_teams: "Teams",
  save_team: "Teams",
  run_sql: "Game data",
  search_wiki: "Wiki",
  submit_answer: "Answer",
  submit_builder_answer: "Teams",
};
const UNKNOWN_INSTRUMENT_TOKEN = "Lookup";

export function instrumentToken(tool: string): string {
  return INSTRUMENT_TOKENS[tool] ?? UNKNOWN_INSTRUMENT_TOKEN;
}

/**
 * One "field note" chip in the streaming trail: the mono instrument word
 * mapped from the tool name (e.g. `get_pokemon` -> "Pokémon", via
 * `instrumentToken`) beside the human-readable subject, with a pokeball
 * micro-spinner while in flight (the latest, unfinished call) or a tick once
 * the loop has moved on. Presentation only — data comes straight from the
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
        {instrumentToken(activity.tool)}
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
 * "streaming"` (specimen desk field notes / soul.md):
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
  composerSlot,
  scopeChipSlot,
}: ChatThreadProps) {
  const showEmptyState = turns.length === 0 && status === "idle";

  // Empty-state filed starters: show a fresh random 6 each time the empty state
  // appears (page load, or returning to it after a "new chat" resets `turns`),
  // so a user discovers Oak's full range over repeated visits. The initial value
  // is the deterministic first-6 so the server render and first client render
  // match (this is a Client Component — `Math.random()` at render time would
  // hydration-mismatch); the post-mount effect then swaps in the random set.
  // Each starter carries category + optional type-dot (specimen desk, soul.md).
  const [examples, setExamples] = useState<StarterPrompt[]>(() =>
    STARTER_ENTRIES.slice(0, 6),
  );
  useEffect(() => {
    if (showEmptyState) setExamples(pickRandomStarters(6));
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

  // The instrument ticker: while working (no prose yet) it's shown in full with
  // the latest row live-spinning; once prose streams it collapses. Before the
  // first tool lands there are no activities — a lone "thinking" row stands in.
  const hasActivity = activity.length > 0;
  const lastIndex = activity.length - 1;
  const collapsed = Boolean(streamingMarkdown);

  // Early type-light for the skeleton (Phase 2): best-effort type hint from
  // tool-activity labels. Conservative — prefer the neutral ink-plate inset over
  // guessing the wrong type.
  const skeletonPlate = useMemo(
    () => plateHintFromToolLabels(activity.map((a) => a.label)),
    [activity],
  );

  const lookupCount = activity.length;
  const thinkingLabel = reconnecting
    ? "Reconnecting…"
    : "Thinking through your question…";

  return (
    <div className="chat-thread" data-testid="chat-thread">
      {showEmptyState && (
        <div
          className={"chat-empty" + (composerSlot ? " chat-empty--hero" : "")}
          data-testid="chat-empty"
        >
          {/* Standby readout — raised panel, LED scope stamp, starters
              (soul.md). No centered logo / equal chips cloud. */}
          <div className="blank-plate" data-testid="blank-plate">
            <div className="blank-plate__top">
              <span className="ilabel blank-plate__ilabel">STANDBY</span>
              {scopeChipSlot && (
                <div
                  className="blank-plate__scope"
                  data-testid="chat-empty-scope-hint"
                >
                  {scopeChipSlot}
                </div>
              )}
            </div>

            <h1 className="blank-plate__prompt">What are we looking up?</h1>
            <p className="blank-plate__sub">
              Every answer carries its receipts — reasoning, sources, and the
              generation it is based on.
            </p>

            {/* Composer promoted into the plate on desktop empty state; on
                mobile / after the first turn this slot is empty and the composer
                stays bottom-docked. */}
            {composerSlot && (
              <div className="chat-empty__composer">{composerSlot}</div>
            )}

            <div className="starters" data-testid="filed-starters">
              <span className="ilabel starters__label">Starters</span>
              {examples.map((entry) => (
                <button
                  key={entry.text}
                  type="button"
                  className="starter"
                  onClick={() => onFollowUp(entry.text)}
                  data-testid="chat-empty-example"
                  data-prompt={entry.text}
                  data-category={entry.category}
                >
                  <span
                    className="starter__dot"
                    style={
                      entry.type
                        ? { background: `var(--type-${entry.type})` }
                        : undefined
                    }
                    data-type={entry.type}
                    aria-hidden="true"
                  />
                  <span className="starter__cat">{entry.category}</span>
                  <span className="starter__text">{entry.text}</span>
                </button>
              ))}
            </div>
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
          error strip) replaces it in place with no jump. Mild type wash when
          activity labels confidently name a type; else sunken desk tint. */}
      {status === "streaming" && !streamingMarkdown && (
        <div
          className={[
            "chat-turn",
            "chat-turn--assistant",
            "chat-thread__skeleton",
            skeletonPlate ? "" : "chat-thread__skeleton--desk",
          ]
            .filter(Boolean)
            .join(" ")}
          style={skeletonPlate?.style}
          data-testid="answer-skeleton"
          data-plate={skeletonPlate?.kind ?? "desk"}
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
