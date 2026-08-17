"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ToolActivityEvent } from "@/lib/sse/sse-types";
import { thinkingHeader, traceRows } from "@/lib/chat/thinking-trace";

/**
 * Expandable thinking trace — sparkle + shimmering "Thinking", then a
 * vertical rail of tool steps (spinner on the live row, check on done).
 * Collapses to "Thought for N seconds" once tokens start. Driven only by
 * real `tool_activity` events; never invents steps.
 */
export default function ThinkingTrace({
  activity,
  reconnecting,
  settled,
}: {
  activity: ToolActivityEvent[];
  reconnecting: boolean;
  settled: boolean;
}) {
  const rows = reconnecting ? [] : traceRows(activity);
  const elapsed = useThinkingElapsed(!settled && !reconnecting, settled);
  const header = thinkingHeader({
    reconnecting,
    settled,
    elapsedSeconds: elapsed,
  });
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const autoOpen = rows.length > 0 && !settled && !reconnecting;
  const open = userOpen ?? autoOpen;
  const scene = `${reconnecting ? 1 : 0}:${settled ? 1 : 0}:${rows.length === 0 ? 0 : 1}`;
  useEffect(() => {
    setUserOpen(null);
  }, [scene]);

  const bodyId = useId();
  const hasRows = rows.length > 0;
  const statusTestId = hasRows ? "field-note" : "progress-thinking";
  const label = (
    <>
      <SparkleIcon live={header.live} />
      <span
        className={
          "thinking-trace__label" +
          (header.live ? " thinking-trace__label--live" : "")
        }
      >
        {header.text}
      </span>
    </>
  );

  return (
    <div className="thinking-trace" data-testid="thinking-trace">
      {hasRows ? (
        <button
          type="button"
          className="thinking-trace__header"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setUserOpen(!open)}
          data-testid={statusTestId}
        >
          {label}
          <span
            className="thinking-trace__caret"
            data-open={open ? "true" : "false"}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div
          className="thinking-trace__header"
          role="status"
          data-testid={statusTestId}
        >
          {label}
        </div>
      )}
      {hasRows && (
        <div
          id={bodyId}
          className="thinking-trace__body"
          data-open={open ? "true" : "false"}
        >
          <div className="thinking-trace__clip">
            <ol className="thinking-trace__rows">
              {rows.map((row, index) => (
                <li
                  key={`${row.tool}-${index}`}
                  className={
                    "thinking-trace__row" +
                    (row.active && !settled
                      ? " thinking-trace__row--active"
                      : "")
                  }
                >
                  {row.active && !settled ? (
                    <span
                      className="thinking-trace__spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckIcon />
                  )}
                  <span className="thinking-trace__primary">{row.primary}</span>
                  {row.secondary && (
                    <span className="thinking-trace__secondary">
                      {row.secondary}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function useThinkingElapsed(running: boolean, settled: boolean): number {
  const startedRef = useRef<number | null>(null);
  const frozenRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running && !settled) {
      startedRef.current = null;
      frozenRef.current = null;
      setElapsed(0);
      return;
    }
    if (startedRef.current == null) startedRef.current = Date.now();
    if (settled) {
      if (frozenRef.current == null) {
        frozenRef.current = Math.max(
          0,
          Math.floor((Date.now() - startedRef.current) / 1000),
        );
      }
      setElapsed(frozenRef.current);
      return;
    }
    frozenRef.current = null;
    const tick = () => {
      const start = startedRef.current;
      if (start == null) return;
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, settled]);

  return elapsed;
}

function SparkleIcon({ live }: { live: boolean }) {
  return (
    <svg
      className="thinking-trace__sparkle"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-live={live ? "true" : "false"}
    >
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="thinking-trace__check"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
