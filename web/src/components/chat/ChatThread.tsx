"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatThreadProps } from "@/components/types";
import AnswerCard from "@/components/answer-card/AnswerCard";
import Markdown from "@/components/Markdown";
import {
  firstFiledStarters,
  pickFiledStarters,
  type StarterPrompt,
} from "@/lib/example-prompts";
import { deriveFollowUpChips, type FollowUpChip } from "@/lib/chat/follow-up-chips";
import { impliedFormatFromAnswer } from "@/lib/chat/implied-format";
import type { Format } from "@/data/formats";
import FollowUpChipRow from "./FollowUpChipRow";
import PinStrip from "./PinStrip";
import TurnActions from "./TurnActions";
import ThinkingTrace from "./ThinkingTrace";
import { instrumentToken } from "@/lib/chat/thinking-trace";

export { instrumentToken };

/** Denylist / daily-cap refusals are not user-retryable (SC-BR-14, SC-AC-5.4). */
function isRetryableTransportCode(code: string): boolean {
  return code !== "account_denied" && code !== "daily_limit";
}

function chipsForAnswer(
  answer: import("@/components/types").OakAnswer,
  currentFormat: Format | undefined,
  mentionedTeam: { id: string; name: string } | null,
  signedIn: boolean,
): FollowUpChip[] {
  const chips = deriveFollowUpChips({
    answer,
    impliedFormat: impliedFormatFromAnswer(answer, currentFormat),
    mentionedTeam: signedIn ? (mentionedTeam ?? undefined) : undefined,
  });
  return signedIn ? chips : chips.filter((c) => c.kind !== "team");
}

/**
 * ChatThread — renders the committed conversation (user + assistant turns) in
 * order, plus the streaming status while `status === "streaming"`:
 *   - an expandable thinking trace (shimmering "Thinking", then one row per
 *     `tool_activity`) while the turn is live. No plate, no sheen, no glow.
 *   - once prose begins streaming (`answer_start`), the trace collapses to
 *     "Thought for N seconds" and the streaming-answer plate rises in.
 *   - a transport-fault affordance when `status === "error"` and
 *     `transportError` is set (in-domain failures arrive as normal answer cards,
 *     never here — sse-client.ts / integration.md); it replaces the status in
 *     place.
 *
 * Each assistant turn is rendered through `AnswerCard`, with `onFollowUp`
 * threaded down so suggestion-chip / candidate-row clicks POST a follow-up turn
 * on the same session. Visual styling deferred to the `frontend-design` skill.
 */
export interface ChatThreadQolProps {
  signedIn?: boolean;
  undoTurnId?: string | null;
  onUndo?: () => void;
  onRetryLast?: () => void;
  onEditLast?: () => void;
  onPinTurn?: (id: string) => void;
  onUnpinTurn?: (id: string) => void;
  onForkTurn?: (id: string) => void;
  pinnedIds?: string[];
  onJumpToPin?: (id: string) => void;
  onShareTurn?: (id: string) => void;
  onFollowUpChip?: (chip: FollowUpChip) => void;
  currentFormat?: Format;
  mentionedTeam?: { id: string; name: string } | null;
  /** When false, hold the empty plate until recents are ready (EMPTY-US-1). */
  emptyReady?: boolean;
  emptyDesk?: {
    lastConversation?: { id: string; title: string } | null;
    lastTeam?: { id: string; name: string } | null;
    scopeLabel?: string;
    onContinue?: () => void;
    onOpenLastTeam?: () => void;
  };
  density?: "full" | "compact";
  hydrate?: {
    status: "running" | "failed";
    assistant_message_id?: string;
  } | null;
  onHydrateRetry?: (turnId: string) => void;
  onOpenCalculator?: (
    calc: import("@/components/types").DamageCalc,
    format: import("@/data/formats").Format,
  ) => void;
}

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
  signedIn = false,
  undoTurnId = null,
  onUndo,
  onRetryLast,
  onEditLast,
  onPinTurn,
  onUnpinTurn,
  onForkTurn,
  pinnedIds = [],
  onJumpToPin,
  onShareTurn,
  onFollowUpChip,
  currentFormat,
  mentionedTeam = null,
  emptyReady = true,
  emptyDesk,
  density = "full",
  hydrate = null,
  onHydrateRetry,
  onOpenCalculator,
}: ChatThreadProps & ChatThreadQolProps) {
  const showEmptyState = turns.length === 0 && status === "idle";

  // Empty-state filed starters: one random prompt per category (Battle → Dex
  // → Rules → Meta) each time the empty state appears, so a user discovers
  // Oak's range over repeated visits. The initial value is the deterministic
  // first-of-each-category slice so the server render and first client render
  // match (`Math.random()` at render time would hydration-mismatch); the
  // post-mount effect then swaps in the random set.
  const [examples, setExamples] = useState<StarterPrompt[]>(() =>
    firstFiledStarters(),
  );
  useEffect(() => {
    if (showEmptyState) setExamples(pickFiledStarters());
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

  const lastUserId = [...turns].reverse().find((t) => t.role === "user")?.id;
  const lastAssistantId = [...turns]
    .reverse()
    .find((t) => t.role === "assistant")?.id;
  const pinnedIdSet = new Set(pinnedIds);
  const pins = pinnedIds.flatMap((id) => {
    const turn = turns.find((t) => t.id === id && t.role === "assistant");
    if (!turn || turn.role !== "assistant") return [];
    const label =
      turn.answer.subjects?.[0]?.name ??
      turn.answer.answer_markdown.split("\n")[0]?.slice(0, 48) ??
      "Pinned turn";
    return [{ id, label }];
  });

  return (
    <div className="chat-thread" data-testid="chat-thread">
      {showEmptyState && (
        <div
          className={"chat-empty" + (composerSlot ? " chat-empty--hero" : "")}
          data-testid={emptyReady ? "chat-empty" : undefined}
        >
          <div className="blank-plate" data-testid="blank-plate">
            <h1 className="blank-plate__prompt">What do you want to know?</h1>
            <p className="blank-plate__sub">
              Teams, calcs, and live usage for Pokémon Champions. Oak will show
              its work.
            </p>

            {/* Composer promoted into the plate on desktop empty state; on
                mobile / after the first turn this slot is empty and the composer
                stays bottom-docked. */}
            {composerSlot && (
              <div className="chat-empty__composer">{composerSlot}</div>
            )}

            {signedIn && emptyDesk && (
              <div className="empty-desk">
                {emptyDesk.lastConversation && (
                  <button
                    type="button"
                    className="empty-desk__row"
                    data-testid="empty-desk-continue"
                    onClick={emptyDesk.onContinue}
                  >
                    Continue {emptyDesk.lastConversation.title}
                  </button>
                )}
                {emptyDesk.lastTeam && (
                  <button
                    type="button"
                    className="empty-desk__row"
                    data-testid="empty-desk-last-team"
                    onClick={emptyDesk.onOpenLastTeam}
                  >
                    {emptyDesk.lastTeam.name}
                  </button>
                )}
                {emptyDesk.scopeLabel && (
                  <div
                    className="empty-desk__row empty-desk__row--static"
                    data-testid="empty-desk-scope"
                  >
                    {emptyDesk.scopeLabel}
                  </div>
                )}
              </div>
            )}

            <div className="starters" data-testid="filed-starters">
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
                  <span className="starter__cat">{entry.category}</span>
                  <span className="starter__text">{entry.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {pins.length > 0 && onJumpToPin && (
        <PinStrip pins={pins} onJump={onJumpToPin} />
      )}

      {turns.map((turn) =>
        turn.role === "user" ? (
          <div
            key={turn.id}
            id={`turn-${turn.id}`}
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
            {undoTurnId === turn.id && onUndo && (
              <button
                type="button"
                className="chat-turn__undo"
                onClick={onUndo}
              >
                Undo
              </button>
            )}
            <TurnActions
              role="user"
              isLast={turn.id === lastUserId}
              signedIn={signedIn}
              streaming={status === "streaming"}
              onEdit={onEditLast}
            />
          </div>
        ) : (
          <div
            key={turn.id}
            id={`turn-${turn.id}`}
            className="chat-turn chat-turn--assistant"
            data-testid="assistant-turn"
          >
            <AnswerCard
              answer={turn.answer}
              onFollowUp={onFollowUp}
              disabled={status === "streaming"}
              signedIn={signedIn}
              onShare={
                onShareTurn ? () => onShareTurn(turn.id) : undefined
              }
              density={density}
              format={currentFormat}
              hydrate={
                hydrate &&
                (!hydrate.assistant_message_id ||
                  hydrate.assistant_message_id === turn.id)
                  ? { status: hydrate.status }
                  : undefined
              }
              onHydrateRetry={
                onHydrateRetry ? () => onHydrateRetry(turn.id) : undefined
              }
              onOpenCalculator={onOpenCalculator}
            />
            <TurnActions
              role="assistant"
              isLast={turn.id === lastAssistantId}
              signedIn={signedIn}
              streaming={status === "streaming"}
              pinned={pinnedIdSet.has(turn.id)}
              onRetry={onRetryLast}
              onPin={onPinTurn ? () => onPinTurn(turn.id) : undefined}
              onUnpin={onUnpinTurn ? () => onUnpinTurn(turn.id) : undefined}
              onFork={onForkTurn ? () => onForkTurn(turn.id) : undefined}
            />
            {onFollowUpChip && (
              <FollowUpChipRow
                chips={chipsForAnswer(
                  turn.answer,
                  currentFormat,
                  signedIn ? mentionedTeam : null,
                  signedIn,
                )}
                onSelect={onFollowUpChip}
                disabled={status === "streaming"}
              />
            )}
          </div>
        ),
      )}

      {status === "streaming" && (
        <div
          className={
            "chat-turn chat-turn--assistant chat-thread__incoming" +
            (streamingMarkdown ? " chat-thread__streaming" : " chat-thread__skeleton")
          }
          data-testid={streamingMarkdown ? undefined : "answer-skeleton"}
        >
          <ThinkingTrace
            activity={activity}
            reconnecting={reconnecting}
            settled={Boolean(streamingMarkdown)}
          />
          {streamingMarkdown ? (
            <div data-testid="streaming-answer" aria-live="polite">
              <Markdown markdown={streamingMarkdown} />
            </div>
          ) : null}
        </div>
      )}

      {status === "error" && transportError && (
        <div
          className="chat-thread__error"
          data-testid="transport-error"
          role="alert"
        >
          <span className="chat-thread__error-text">
            {transportError.message}
          </span>
          {onRetry && isRetryableTransportCode(transportError.code) && (
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
