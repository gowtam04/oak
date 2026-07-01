"use client";

import type { OakAnswer } from "@/components/types";
import type { TurnDetail as TurnDetailRecord } from "@/lib/admin/admin-types";
import AnswerCard from "@/components/answer-card/AnswerCard";

/**
 * TurnDetail — the full, READ-ONLY per-turn drill-down breakdown for the admin
 * panel (ADMIN-US-5, ADMIN-AC-5.2). Given one {@link TurnDetailRecord} (the
 * `turn` field of a `TurnDetailResponse` from `GET /api/admin/turns/{id}`), it
 * renders every recorded facet of the turn:
 *
 *   1. Identity     — status, turn id (= request_id), session, account, mode,
 *                     model + provider model, timestamp.
 *   2. Metrics      — input/output/thinking tokens (+ total), citation count,
 *                     latency, attached-image count, tool-error count, and the
 *                     ESTIMATED cost (ADMIN-BR-5 — always flagged "estimated").
 *   3. Prompt       — the user's message (`prompt_text`); flags an image-only
 *                     turn when the text is empty.
 *   4. Tool trace   — each `ToolTraceEntry` (tool, latency, cache hit, error,
 *                     args) so the operator can see how the answer was derived.
 *   5. Answer       — the stored `answer_json` RE-RENDERED through the real
 *                     {@link AnswerCard}, so the operator sees exactly what the
 *                     user saw. Falls back to raw text / a "no answer recorded"
 *                     note for malformed or rate-limited rows.
 *
 * READ-ONLY (ADMIN-BR-2): this view never mutates anything. `AnswerCard` is
 * rendered WITHOUT an `onFollowUp` handler, so its interactive leaves
 * (suggestions, candidate rows) are inert no-ops here — they cannot start a
 * chat turn from the admin panel.
 *
 * Pure presentational client component: it takes a fixture-shaped prop and
 * imports no db/repos/runtime (admin component-test rule).
 */

export interface TurnDetailProps {
  turn: TurnDetailRecord;
}

/** Human-readable label for each recorded turn status. */
const STATUS_LABEL: Record<TurnDetailRecord["status"], string> = {
  answered: "Answered",
  clarification_needed: "Clarification needed",
  resolution_failed: "Resolution failed",
  insufficient_data: "Insufficient data",
  rate_limited: "Rate limited",
};

/** epoch-ms → ISO string; tolerant of a 0/NaN value. */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toISOString();
}

/** Estimated USD cost, fixed to a readable precision (ADMIN-BR-5). */
function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.0000";
  return `$${n.toFixed(4)}`;
}

/** Integer with thousands separators; tolerant of nullish. */
function formatInt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

/**
 * Parse the stored `answer_json` into an `OakAnswer` for re-render. Returns null
 * when the column is null (rate-limited rows) or the JSON is malformed / not a
 * recognizable answer payload. No Zod validation here — a light structural
 * guard (object with a string `answer_markdown`) keeps this client-side and
 * avoids crashing `AnswerCard` on a stray shape.
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

/** One labelled value cell in a metric/identity grid. */
function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="turn-detail__field" data-testid={testId}>
      <dt className="turn-detail__field-label">{label}</dt>
      <dd className="turn-detail__field-value">{value}</dd>
    </div>
  );
}

export default function TurnDetail({ turn }: TurnDetailProps) {
  const totalTokens =
    turn.inputTokens + turn.outputTokens + turn.thinkingTokens;

  const answer = parseAnswerJson(turn.answerJson);
  const isImageOnly = turn.promptText.trim() === "" && turn.imagesCount > 0;

  return (
    <section className="turn-detail" data-testid="turn-detail">
      <header className="turn-detail__header">
        <span
          className="turn-detail__status"
          data-testid="turn-detail-status"
          data-status={turn.status}
        >
          {STATUS_LABEL[turn.status]}
        </span>
        <code className="turn-detail__id" data-testid="turn-detail-id">
          {turn.id}
        </code>
      </header>

      {/* 1. Identity */}
      <dl className="turn-detail__grid turn-detail__identity">
        <Field
          label="Account"
          testId="turn-detail-account"
          value={turn.accountEmail ?? (turn.accountId ? turn.accountId : "Guest")}
        />
        <Field
          label="Session"
          testId="turn-detail-session"
          value={<code>{turn.sessionId}</code>}
        />
        <Field
          label="Mode"
          testId="turn-detail-mode"
          value={turn.mode}
        />
        <Field
          label="Model"
          testId="turn-detail-model"
          value={
            turn.model
              ? `${turn.model}${turn.providerModel ? ` (${turn.providerModel})` : ""}`
              : "—"
          }
        />
        <Field
          label="Created"
          testId="turn-detail-created"
          value={formatTimestamp(turn.createdAt)}
        />
      </dl>

      {/* 2. Metrics */}
      <dl
        className="turn-detail__grid turn-detail__metrics"
        data-testid="turn-detail-tokens"
      >
        <Field
          label="Input tokens"
          testId="turn-detail-input-tokens"
          value={formatInt(turn.inputTokens)}
        />
        <Field
          label="Output tokens"
          testId="turn-detail-output-tokens"
          value={formatInt(turn.outputTokens)}
        />
        <Field
          label="Thinking tokens"
          testId="turn-detail-thinking-tokens"
          value={formatInt(turn.thinkingTokens)}
        />
        <Field
          label="Total tokens"
          testId="turn-detail-total-tokens"
          value={formatInt(totalTokens)}
        />
        <Field
          label="Citations"
          testId="turn-detail-citations"
          value={formatInt(turn.citationCount)}
        />
        <Field
          label="Latency"
          testId="turn-detail-latency"
          value={`${formatInt(turn.turnLatencyMs)} ms`}
        />
        <Field
          label="Images"
          testId="turn-detail-images"
          value={formatInt(turn.imagesCount)}
        />
        <Field
          label="Tool errors"
          testId="turn-detail-tool-errors"
          value={formatInt(turn.toolErrorCount)}
        />
        <Field
          label="Est. cost"
          testId="turn-detail-cost"
          value={
            <>
              {formatUsd(turn.estUsd)}{" "}
              <span className="turn-detail__estimate-tag">(estimated)</span>
            </>
          }
        />
      </dl>

      {/* 3. Prompt */}
      <div className="turn-detail__section">
        <h3 className="turn-detail__section-title">Prompt</h3>
        <div className="turn-detail__prompt" data-testid="turn-detail-prompt">
          {turn.promptText.trim() !== "" ? (
            <pre className="turn-detail__prompt-text">{turn.promptText}</pre>
          ) : (
            <p className="turn-detail__empty">
              {isImageOnly
                ? "(image-only turn — no text prompt)"
                : "(no prompt recorded)"}
            </p>
          )}
        </div>
      </div>

      {/* 4. Tool trace */}
      <div className="turn-detail__section">
        <h3 className="turn-detail__section-title">
          Tool trace ({turn.toolTrace.length})
        </h3>
        {turn.toolTrace.length === 0 ? (
          <p className="turn-detail__empty" data-testid="turn-detail-no-tools">
            No tools were called for this turn.
          </p>
        ) : (
          <table
            className="turn-detail__tool-trace"
            data-testid="turn-detail-tool-trace"
          >
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Tool</th>
                <th scope="col">Latency</th>
                <th scope="col">Cache</th>
                <th scope="col">Result</th>
                <th scope="col">Args</th>
              </tr>
            </thead>
            <tbody>
              {turn.toolTrace.map((entry, i) => (
                <tr
                  key={`${entry.tool}-${i}`}
                  data-testid={`turn-trace-row-${i}`}
                  data-error={entry.error != null}
                >
                  <td>{i + 1}</td>
                  <td>
                    <code>{entry.tool}</code>
                  </td>
                  <td>{formatInt(entry.latency_ms)} ms</td>
                  <td>{entry.cache_hit ? "hit" : "miss"}</td>
                  <td
                    className={
                      entry.error != null
                        ? "turn-detail__tool-error"
                        : "turn-detail__tool-ok"
                    }
                  >
                    {entry.error != null ? entry.error : "ok"}
                  </td>
                  <td>
                    <pre className="turn-detail__tool-args">
                      {JSON.stringify(entry.args)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. Answer (answer_json re-render) */}
      <div className="turn-detail__section">
        <h3 className="turn-detail__section-title">Answer</h3>
        <div className="turn-detail__answer" data-testid="turn-detail-answer">
          {answer ? (
            <AnswerCard answer={answer} />
          ) : turn.answerText != null && turn.answerText.trim() !== "" ? (
            <pre
              className="turn-detail__answer-text"
              data-testid="turn-detail-answer-text"
            >
              {turn.answerText}
            </pre>
          ) : (
            <p className="turn-detail__empty" data-testid="turn-detail-no-answer">
              {turn.status === "rate_limited"
                ? "No answer recorded — this turn was rate-limited before it ran."
                : "No answer recorded for this turn."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
