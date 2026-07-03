/**
 * TeamsAssistantPanel — the collapsible team-builder AI panel docked on the
 * right of the /teams editor (signed-in only; the page gates rendering).
 *
 * A deliberately lean chat surface (NOT ChatThread/AnswerCard — those render
 * the full OakAnswer contract): user bubbles, assistant markdown, a live
 * tool-activity ticker, and — when an answer carries a `team_patch` — a change
 * card with Apply / Undo. Apply snapshots the editor draft, then applies the
 * patch through the SAME `applyTeamPatch` the server validated with; Undo
 * restores the exact snapshot. Nothing here touches the DB — the user still
 * reviews and saves in the editor.
 *
 * CLIENT-SAFE imports only (schemas.ts, the sse client, display helpers) —
 * never repos/db/runtime (jsdom test boundary).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";
import {
  useTeamsAssistant,
  type AssistantTurn,
} from "@/lib/sse/teams-assistant-sse-client";
import type { TeamsAssistantDraft } from "@/lib/sse/teams-assistant-sse-types";
import type { TeamPatch } from "@/agent/teams-assistant/schemas";
import type { TeamMember } from "@/data/teams/team-schema";
import type { Format } from "@/data/formats";
import { titleizeSlug } from "./display-names";

/** Collapse-state persistence key (a UX nicety, not load-bearing). */
const COLLAPSE_KEY = "oak-teams-assistant-collapsed";

/** First-use prompts — one tap sends them with the live draft attached. */
const ASSISTANT_SUGGESTIONS = [
  "Check my coverage",
  "Fill slot 3",
  "Suggest an item",
] as const;

export interface TeamsAssistantPanelProps {
  /** The open team's id — switching teams resets the thread. */
  teamId: string;
  format: Format;
  /** Read the live, unsaved draft from the editor (called at send/apply time). */
  getDraft: () => { name: string; members: TeamMember[] };
  /** Apply an assistant patch to the editor draft. */
  applyPatch: (patch: TeamPatch) => void;
  /** Restore an exact draft snapshot (Undo). */
  replaceDraft: (draft: { name: string; members: TeamMember[] }) => void;
}

/** Human-readable one-liners for a patch's operations (self-contained). */
export function describePatch(patch: TeamPatch): string[] {
  const lines: string[] = [];
  if (patch.name != null) {
    lines.push(`Rename team to “${patch.name}”`);
  }
  for (const op of patch.slots) {
    const n = op.slot + 1;
    if (op.member === null) {
      lines.push(`Slot ${n}: remove`);
      continue;
    }
    const m = op.member;
    const species = m.species ? titleizeSlug(m.species) : "(empty)";
    const bits: string[] = [];
    if (m.ability) bits.push(titleizeSlug(m.ability));
    if (m.item) bits.push(titleizeSlug(m.item));
    if (m.moves.length > 0)
      bits.push(m.moves.map((mv) => titleizeSlug(mv)).join(" / "));
    if (m.nature) bits.push(`${titleizeSlug(m.nature)} nature`);
    lines.push(
      `Slot ${n}: ${species}${bits.length ? " — " + bits.join(" · ") : ""}`,
    );
  }
  return lines;
}

interface AppliedSnapshot {
  turnId: number;
  snapshot: { name: string; members: TeamMember[] };
}

export default function TeamsAssistantPanel({
  teamId,
  format,
  getDraft,
  applyPatch,
  replaceDraft,
}: TeamsAssistantPanelProps) {
  const assistant = useTeamsAssistant();
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [appliedTurns, setAppliedTurns] = useState<Set<number>>(new Set());
  const [lastApplied, setLastApplied] = useState<AppliedSnapshot | null>(null);
  const lastMessageRef = useRef("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Restore the collapse preference once on mount.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage unavailable (private mode) — default expanded.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Best-effort persistence only.
      }
      return next;
    });
  }, []);

  // A different team ⇒ a fresh thread (the draft context changed wholesale).
  const { reset } = assistant;
  useEffect(() => {
    reset();
    setAppliedTurns(new Set());
    setLastApplied(null);
  }, [teamId, reset]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [assistant.turns, assistant.streamingMarkdown, assistant.activity]);

  const sendMessage = useCallback(
    (text: string) => {
      const draft = getDraft();
      const wireDraft: TeamsAssistantDraft = {
        name: draft.name,
        format,
        members: draft.members,
      };
      lastMessageRef.current = text;
      void assistant.send(text, wireDraft);
    },
    [assistant, format, getDraft],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || assistant.status === "thinking") return;
      setInput("");
      sendMessage(text);
    },
    [input, assistant.status, sendMessage],
  );

  const handleApply = useCallback(
    (turn: AssistantTurn) => {
      const patch = turn.answer?.team_patch;
      if (!patch) return;
      setLastApplied({ turnId: turn.id, snapshot: getDraft() });
      setAppliedTurns((prev) => new Set(prev).add(turn.id));
      applyPatch(patch);
    },
    [applyPatch, getDraft],
  );

  const handleUndo = useCallback(() => {
    if (!lastApplied) return;
    replaceDraft(lastApplied.snapshot);
    setAppliedTurns((prev) => {
      const next = new Set(prev);
      next.delete(lastApplied.turnId);
      return next;
    });
    setLastApplied(null);
  }, [lastApplied, replaceDraft]);

  if (collapsed) {
    return (
      <aside
        className="assistant-panel assistant-panel--collapsed"
        data-testid="assistant-panel-collapsed"
      >
        <button
          type="button"
          className="assistant-panel__expand"
          onClick={toggleCollapsed}
          title="Open the team-building assistant"
          data-testid="assistant-expand"
        >
          <span aria-hidden>✨</span>
          <span className="assistant-panel__expand-label">Assistant</span>
        </button>
      </aside>
    );
  }

  const thinking = assistant.status === "thinking";

  return (
    <aside className="assistant-panel" data-testid="assistant-panel">
      <div className="assistant-panel__header">
        <span className="assistant-panel__title">
          <span aria-hidden>✨</span> Team assistant
        </span>
        <button
          type="button"
          className="assistant-panel__collapse"
          onClick={toggleCollapsed}
          title="Collapse"
          data-testid="assistant-collapse"
        >
          →
        </button>
      </div>

      <div className="assistant-panel__thread" ref={threadRef}>
        {assistant.turns.length === 0 && !thinking && (
          <div className="assistant-panel__intro" data-testid="assistant-empty">
            <p className="assistant-panel__empty">
              I can see the team you have open. Ask me to fill a slot, fix a
              moveset, check your coverage, or suggest a spread — edits apply to
              your unsaved draft, and you keep the Save button.
            </p>
            <div
              className="assistant-panel__suggestions"
              data-testid="assistant-suggestions"
            >
              <span className="ilabel">Try asking</span>
              <div className="assistant-panel__chips">
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="assistant-panel__chip"
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {assistant.turns.map((turn) => (
          <div className="assistant-turn" key={turn.id}>
            <div className="assistant-turn__user" data-testid="assistant-user-msg">
              {turn.user}
            </div>
            {turn.answer && (
              <div
                className="assistant-turn__answer"
                data-testid="assistant-answer"
              >
                <div className="assistant-turn__bubble">
                  <Markdown markdown={turn.answer.answer_markdown} />
                </div>
                {turn.answer.team_patch &&
                  turn.answer.team_patch.slots.length +
                    (turn.answer.team_patch.name != null ? 1 : 0) >
                    0 && (
                    <div
                      className="assistant-patch"
                      data-testid="assistant-patch-card"
                    >
                      <div className="assistant-patch__title">
                        Proposed changes
                      </div>
                      <ul className="assistant-patch__list">
                        {describePatch(turn.answer.team_patch).map(
                          (line, i) => (
                            <li key={i}>{line}</li>
                          ),
                        )}
                      </ul>
                      <div className="assistant-patch__actions">
                        {appliedTurns.has(turn.id) ? (
                          <>
                            <span className="assistant-patch__applied">
                              Applied to draft ✓
                            </span>
                            {lastApplied?.turnId === turn.id && (
                              <button
                                type="button"
                                className="tm-btn tm-btn--secondary"
                                onClick={handleUndo}
                                data-testid="assistant-undo"
                              >
                                Undo
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            className="tm-btn tm-btn--primary"
                            onClick={() => handleApply(turn)}
                            data-testid="assistant-apply"
                          >
                            Apply to draft
                          </button>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="assistant-turn__pending" data-testid="assistant-pending">
            {assistant.streamingMarkdown ? (
              <Markdown markdown={assistant.streamingMarkdown} />
            ) : (
              <span className="assistant-panel__activity">
                {assistant.activity ?? "Thinking…"}
              </span>
            )}
          </div>
        )}

        {assistant.error && (
          <div className="assistant-panel__error" data-testid="assistant-error">
            <span>{assistant.error}</span>
            {lastMessageRef.current && (
              <button
                type="button"
                className="tm-btn tm-btn--secondary"
                onClick={() => sendMessage(lastMessageRef.current)}
                data-testid="assistant-retry"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <form className="assistant-panel__composer" onSubmit={handleSubmit}>
        <input
          type="text"
          className="assistant-panel__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this team…"
          disabled={thinking}
          data-testid="assistant-input"
        />
        <button
          type="submit"
          className="tm-btn tm-btn--primary"
          disabled={thinking || input.trim().length === 0}
          data-testid="assistant-send"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
