"use client";

/**
 * VoiceOverlay — the Pokédex-flavored voice surface. A modal overlay that owns
 * one {@link VoiceSession} for its lifetime: it opens when `open` flips true,
 * subscribes to the session's phase / captions / tool activity, and ends the
 * session (releasing mic + socket) on close or unmount.
 *
 * The session's side effects are dependency-injected (see `voice-session.ts`),
 * so this component takes an optional `createSession` seam — the default builds
 * the real browser seams (`audio-io.ts` + `fetch` to `/api/voice/*`), and jsdom
 * tests inject a fake-driven session with scripted socket events.
 *
 * Styling lives in the `voice-overlay*` / `voice-*` BEM classes appended to
 * `globals.css`; the tool ticker reuses the "field note" visual language of the
 * chat streaming trail.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Format } from "@/data/formats";
import {
  VoiceSession,
  type VoiceCaption,
  type VoicePhase,
  type VoiceToolActivity,
} from "@/lib/voice/voice-session";
import { BrowserVoiceAudioIO, browserConnect } from "@/lib/voice/audio-io";
import type {
  VoiceTokenRequestBody,
  VoiceTokenResponseBody,
  VoiceToolRequestBody,
  VoiceToolResponseBody,
  VoiceTranscriptRequestBody,
} from "@/lib/voice/voice-types";

/**
 * Builds a {@link VoiceSession} for the overlay. The default constructs the real
 * browser seams; jsdom tests inject a factory that wires fake seams (so no DOM
 * audio/socket APIs are touched). Seam construction lives INSIDE the factory so
 * the real DOM seams are only ever built by the default path.
 */
export type VoiceSessionFactory = (opts: {
  sessionId: string;
  format: Format;
}) => VoiceSession;

export interface VoiceOverlayProps {
  open: boolean;
  onClose: () => void;
  /** The signed-in conversation id (voice turns persist into it). */
  sessionId: string;
  /** The data scope in effect when the overlay opened. */
  format: Format;
  /** Test seam: build the session (defaults to the real browser seams). */
  createSession?: VoiceSessionFactory;
}

/** Human phase labels for the status line. */
const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "Warming up…",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Checking my data…",
  speaking: "Speaking",
  ended: "Session ended",
  error: "Voice unavailable",
};

export default function VoiceOverlay({
  open,
  onClose,
  sessionId,
  format,
  createSession = createBrowserSession,
}: VoiceOverlayProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<VoiceCaption>({ user: "", assistant: "" });
  const [tools, setTools] = useState<VoiceToolActivity[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const sessionRef = useRef<VoiceSession | null>(null);

  // Latest inputs in refs so the open/close effect depends only on `open` and
  // never rebuilds the session mid-conversation on an unrelated re-render.
  const latest = useRef({ sessionId, format, createSession });
  latest.current = { sessionId, format, createSession };

  // Session lifecycle: start on open, tear down on close/unmount.
  useEffect(() => {
    if (!open) return;
    const { sessionId: sid, format: fmt, createSession: make } = latest.current;
    const session = make({ sessionId: sid, format: fmt });
    sessionRef.current = session;
    setPhase("idle");
    setError(null);
    setCaption({ user: "", assistant: "" });
    setTools([]);
    setElapsed(0);

    const offState = session.onState((s) => {
      setPhase(s.phase);
      setError(s.error);
    });
    const offCaption = session.onCaption(setCaption);
    const offTools = session.onToolActivity((list) => setTools([...list]));
    void session.start();

    return () => {
      offState();
      offCaption();
      offTools();
      session.end();
      sessionRef.current = null;
    };
  }, [open]);

  // Elapsed-time ticker while the session is live.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (s) setElapsed(s.elapsedMs());
    }, 500);
    return () => clearInterval(id);
  }, [open]);

  const handleClose = useCallback(() => {
    sessionRef.current?.end();
    onClose();
  }, [onClose]);

  // Escape closes (parity with the app's other overlays).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  const listening = phase === "listening";
  const speaking = phase === "speaking";

  return (
    <div
      className="voice-overlay"
      data-testid="voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Oak voice mode"
    >
      <div className="voice-overlay__panel">
        <button
          type="button"
          className="voice-overlay__dismiss"
          onClick={handleClose}
          aria-label="Close voice mode"
        >
          ×
        </button>

        <div
          className={
            "voice-orb" +
            (listening ? " voice-orb--listening" : "") +
            (speaking ? " voice-orb--speaking" : "")
          }
          aria-hidden="true"
        >
          <MicGlyph />
        </div>

        <p className="voice-overlay__phase" data-testid="voice-phase" aria-live="polite">
          {PHASE_LABEL[phase]}
        </p>

        {error && (
          <p className="voice-overlay__error" data-testid="voice-error" role="alert">
            {error}
          </p>
        )}

        <div className="voice-overlay__captions">
          {caption.user && (
            <p className="voice-caption voice-caption--user" data-testid="voice-caption-user">
              <span className="voice-caption__who">You</span>
              {caption.user}
            </p>
          )}
          {caption.assistant && (
            <p
              className="voice-caption voice-caption--assistant"
              data-testid="voice-caption-assistant"
            >
              <span className="voice-caption__who">Oak</span>
              {caption.assistant}
            </p>
          )}
        </div>

        {tools.length > 0 && (
          <ul className="voice-tools" data-testid="voice-tools">
            {tools.map((t) => (
              <li key={t.id} className="voice-tools__item" data-testid="voice-tool">
                <span className="ilabel voice-tools__tool">{t.tool.toUpperCase()}</span>
                <span className="voice-tools__desc">{noteText(t.label)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="voice-overlay__footer">
          <span className="voice-overlay__timer" data-testid="voice-timer">
            {formatElapsed(elapsed)}
          </span>
          <button
            type="button"
            className="voice-overlay__end"
            data-testid="voice-end"
            onClick={handleClose}
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}

/** Strip the leading emoji the tool label carries (the ticker has its own glyph). */
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍]+\s*/u;
function noteText(label: string): string {
  return label.replace(EMOJI_PREFIX, "").trimStart() || label;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={9} y={2} width={6} height={12} rx={3} />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Default (real) browser seams — bypassed by jsdom tests via `createSession`.
// ---------------------------------------------------------------------------

const createBrowserSession: VoiceSessionFactory = ({ sessionId, format }) =>
  new VoiceSession({ sessionId, format, seams: browserSeams() });

/**
 * Assemble the real DOM seams. `audio-io` runs no DOM code at import time (only
 * class/function definitions), so importing it is safe under jsdom; the DOM APIs
 * fire only when this runs — and tests inject their own factory, never calling
 * this path.
 */
function browserSeams() {
  return {
    connect: browserConnect,
    audio: new BrowserVoiceAudioIO(),
    fetchToken: (body: VoiceTokenRequestBody) =>
      postJson<VoiceTokenResponseBody>("/api/voice/token", body),
    execTool: (body: VoiceToolRequestBody) =>
      postJson<VoiceToolResponseBody>("/api/voice/tool", body),
    postTranscript: async (body: VoiceTranscriptRequestBody) => {
      await postJson<unknown>("/api/voice/transcript", body);
    },
    now: () => Date.now(),
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      /* non-JSON body — keep the status message */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
