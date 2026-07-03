/**
 * VoiceSession — the framework-free state machine that drives one voice
 * conversation with xAI's Grok Voice Agent over a direct WebSocket.
 *
 * It is DEPENDENCY-INJECTED: every side effect (socket, audio IO, HTTP to our
 * `/api/voice/*` routes, the clock) arrives through {@link VoiceSessionSeams},
 * so jsdom tests drive it with scripted fakes and never touch real WebSocket /
 * AudioContext / getUserMedia. The real DOM seams live in
 * `@/lib/voice/audio-io` and are assembled by the overlay.
 *
 * Lifecycle (plan §5, Workstream F):
 *   idle → connecting → listening ⇄ thinking ⇄ speaking → … → ended | error
 *
 * Responsibilities: fetch an ephemeral token, open the socket with the
 * `xai-client-secret.<token>` subprotocol, push a single `session.update` from
 * the bootstrap, stream mic audio, drive phase transitions, flush playback on
 * barge-in BEFORE any bookkeeping, batch parallel tool calls (all outputs then
 * one `response.create`), persist each finished turn fire-and-forget, answer
 * pings, and auto-end at the session cap. No React, no DOM here.
 */

import type {
  VoiceTokenRequestBody,
  VoiceToolRequestBody,
  VoiceTranscriptRequestBody,
  VoiceSessionBootstrap,
} from "@/lib/voice/voice-types";
import type { Format } from "@/data/formats";
import {
  clientSecretSubprotocol,
  parseServerEvent,
  realtimeUrl,
  voiceToolLabel,
  VOICE_TRANSCRIBE_MODEL,
  type ClientEvent,
  type ServerEvent,
} from "@/lib/voice/voice-protocol";

// ---------------------------------------------------------------------------
// Seams (injected)
// ---------------------------------------------------------------------------

/** A thin WebSocket wrapper — the only socket surface the machine touches. */
export interface VoiceSocket {
  send(data: string): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: unknown) => void): void;
}

/** Real-time audio capture + playback, at a single fixed {@link sampleRate}. */
export interface VoiceAudioIO {
  /** The context sample rate (an xAI-supported value). */
  readonly sampleRate: number;
  /** Begin mic capture; `onChunk` receives ~100 ms base64 PCM16 frames. */
  startCapture(onChunk: (base64Pcm16: string) => void): Promise<void>;
  /** Stop mic capture and release the microphone. */
  stopCapture(): void;
  /** Queue a base64 PCM16 playback chunk. */
  enqueue(base64Pcm16: string): void;
  /** Stop + clear all queued/playing audio (barge-in). */
  flush(): void;
  /** Release the audio context entirely. */
  close(): void;
}

export interface VoiceSessionSeams {
  connect(url: string, subprotocol: string): VoiceSocket;
  audio: VoiceAudioIO;
  fetchToken(
    body: VoiceTokenRequestBody,
  ): Promise<{ token: string; expires_at: number; session: VoiceSessionBootstrap }>;
  execTool(
    body: VoiceToolRequestBody,
  ): Promise<{ output: unknown }>;
  postTranscript(body: VoiceTranscriptRequestBody): Promise<void>;
  now(): number;
}

export interface VoiceSessionOptions {
  sessionId: string;
  format: Format;
  seams: VoiceSessionSeams;
}

// ---------------------------------------------------------------------------
// Observable state
// ---------------------------------------------------------------------------

export type VoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

export interface VoiceSessionState {
  phase: VoicePhase;
  /** User-readable message when `phase === "error"`, else null. */
  error: string | null;
}

/** Live captions for the CURRENT turn (both reset when a turn completes). */
export interface VoiceCaption {
  user: string;
  assistant: string;
}

/** One tool the model invoked this turn, for the overlay ticker. */
export interface VoiceToolActivity {
  id: string;
  tool: string;
  label: string;
}

type StateListener = (state: VoiceSessionState) => void;
type CaptionListener = (caption: VoiceCaption) => void;
type ToolListener = (activities: VoiceToolActivity[]) => void;

export class VoiceSession {
  private readonly sessionId: string;
  private readonly format: Format;
  private readonly seams: VoiceSessionSeams;

  private socket: VoiceSocket | null = null;
  private phase: VoicePhase = "idle";
  private error: string | null = null;

  // Per-turn caption accumulators.
  private userText = "";
  private assistantText = "";
  private toolActivities: VoiceToolActivity[] = [];

  // Function calls collected during the in-flight model response. Kept until
  // `response.done` closes the batch (all parallel calls are in by then).
  private pendingCalls: { call_id: string; promise: Promise<{ output: unknown }> }[] =
    [];

  private maxSessionTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private finished = false; // end() called or a terminal error/timeout reached

  private readonly stateListeners = new Set<StateListener>();
  private readonly captionListeners = new Set<CaptionListener>();
  private readonly toolListeners = new Set<ToolListener>();

  constructor(opts: VoiceSessionOptions) {
    this.sessionId = opts.sessionId;
    this.format = opts.format;
    this.seams = opts.seams;
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  onState(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    cb(this.snapshot());
    return () => this.stateListeners.delete(cb);
  }

  onCaption(cb: CaptionListener): () => void {
    this.captionListeners.add(cb);
    return () => this.captionListeners.delete(cb);
  }

  onToolActivity(cb: ToolListener): () => void {
    this.toolListeners.add(cb);
    return () => this.toolListeners.delete(cb);
  }

  getPhase(): VoicePhase {
    return this.phase;
  }

  /** Milliseconds since the socket opened (0 before connect). */
  elapsedMs(): number {
    return this.startedAt === 0 ? 0 : this.seams.now() - this.startedAt;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.phase !== "idle") return;
    this.setPhase("connecting");

    let bootstrap: VoiceSessionBootstrap;
    try {
      const res = await this.seams.fetchToken({
        session_id: this.sessionId,
        format: this.format,
      });
      bootstrap = res.session;
      this.connectSocket(res.token, bootstrap);
    } catch (err) {
      this.fail(errMessage(err, "Couldn't start voice mode."));
    }
  }

  end(): void {
    if (this.finished) {
      // Still ensure resources are released if end() races itself.
      this.teardown();
      return;
    }
    this.finished = true;
    this.teardown();
    if (this.phase !== "error") this.setPhase("ended");
  }

  // ── Socket wiring ────────────────────────────────────────────────────────

  private connectSocket(token: string, bootstrap: VoiceSessionBootstrap): void {
    let socket: VoiceSocket;
    try {
      socket = this.seams.connect(
        realtimeUrl(bootstrap.model),
        clientSecretSubprotocol(token),
      );
    } catch (err) {
      this.fail(errMessage(err, "Couldn't connect to the voice service."));
      return;
    }
    this.socket = socket;

    socket.onOpen(() => {
      if (this.finished) return;
      this.startedAt = this.seams.now();
      this.scheduleMaxSession(bootstrap.max_session_ms);
      this.send(this.buildSessionUpdate(bootstrap));
      void this.beginCapture();
    });
    socket.onMessage((data) => this.handleMessage(data));
    socket.onClose(() => {
      if (this.finished) return;
      // A clean close we didn't initiate — end the session gracefully.
      this.finished = true;
      this.teardown();
      if (this.phase !== "error") this.setPhase("ended");
    });
    socket.onError((err) => {
      if (this.finished) return;
      this.fail(errMessage(err, "The voice connection dropped."));
    });
  }

  private async beginCapture(): Promise<void> {
    try {
      await this.seams.audio.startCapture((chunk) => {
        if (this.finished) return;
        this.send({ type: "input_audio_buffer.append", audio: chunk });
      });
      if (!this.finished) this.setPhase("listening");
    } catch (err) {
      this.fail(errMessage(err, "Couldn't access the microphone."));
    }
  }

  private buildSessionUpdate(bootstrap: VoiceSessionBootstrap): ClientEvent {
    const rate = this.seams.audio.sampleRate;
    return {
      type: "session.update",
      session: {
        instructions: bootstrap.instructions,
        voice: bootstrap.voice,
        turn_detection: {
          type: "server_vad",
          idle_timeout_ms: bootstrap.idle_timeout_ms,
        },
        audio: {
          input: {
            format: { type: "audio/pcm", rate },
            transcription: { model: VOICE_TRANSCRIBE_MODEL },
          },
          output: { format: { type: "audio/pcm", rate } },
        },
        reasoning: { effort: bootstrap.reasoning_effort },
        tools: bootstrap.tools.map((t) => ({
          type: "function" as const,
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    };
  }

  // ── Server event handling ────────────────────────────────────────────────

  private handleMessage(data: string): void {
    if (this.finished) return;
    const event = parseServerEvent(data);
    if (event === null) return;
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        // BARGE-IN: flush playback FIRST, before any state bookkeeping.
        this.seams.audio.flush();
        // A new user utterance starts a fresh turn — clear the ticker + the
        // interrupted assistant caption so the next answer renders clean.
        this.assistantText = "";
        this.toolActivities = [];
        this.emitCaption();
        this.emitTools();
        this.setPhase("listening");
        break;
      case "response.created":
        // A fresh model response — reset its assistant caption accumulator.
        this.assistantText = "";
        this.setPhase("thinking");
        break;
      case "response.output_audio.delta":
        this.seams.audio.enqueue(event.delta);
        this.setPhase("speaking");
        break;
      case "response.output_audio_transcript.delta":
        this.assistantText += event.delta;
        this.emitCaption();
        this.setPhase("speaking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.userText = event.transcript;
        this.emitCaption();
        break;
      case "response.function_call_arguments.done":
        this.collectFunctionCall(event);
        break;
      case "response.done":
        this.handleResponseDone();
        break;
      case "ping":
        this.send({
          type: "pong",
          ping_timestamp: event.ping_timestamp ?? this.seams.now(),
        });
        break;
      case "error":
        this.handleServerError(event);
        break;
      // session.created / session.updated / speech_stopped / committed /
      // transcript.done — no state change needed.
      default:
        break;
    }
  }

  private collectFunctionCall(event: {
    name: string;
    call_id: string;
    arguments: string;
  }): void {
    // Surface the call in the ticker immediately (the model announces it aloud
    // too — the persona says a filler before calling).
    this.toolActivities = [
      ...this.toolActivities,
      { id: event.call_id, tool: event.name, label: voiceToolLabel(event.name) },
    ];
    this.emitTools();
    this.setPhase("thinking");
    // Execute eagerly (concurrently across parallel calls); the result is
    // gathered at the batch boundary (response.done).
    const promise = this.seams
      .execTool({
        session_id: this.sessionId,
        format: this.format,
        name: event.name,
        arguments: event.arguments,
      })
      .catch((err) => ({
        output: {
          error: "tool_failed",
          detail: errMessage(err, "tool request failed"),
        },
      }));
    this.pendingCalls.push({ call_id: event.call_id, promise });
  }

  private handleResponseDone(): void {
    if (this.pendingCalls.length > 0) {
      // This response was a batch of function calls — send every output, then
      // exactly ONE response.create so the model continues from the results.
      const batch = this.pendingCalls;
      this.pendingCalls = [];
      void Promise.all(
        batch.map(async ({ call_id, promise }) => ({
          call_id,
          output: (await promise).output,
        })),
      ).then((results) => {
        if (this.finished) return;
        for (const { call_id, output } of results) {
          this.send({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id,
              output: safeStringify(output),
            },
          });
        }
        this.send({ type: "response.create" });
      });
      return;
    }

    // A spoken turn finished. Persist the pair fire-and-forget, then reset the
    // per-turn accumulators and return to listening.
    if (this.userText.trim() && this.assistantText.trim()) {
      void this.seams
        .postTranscript({
          session_id: this.sessionId,
          format: this.format,
          user_text: this.userText,
          assistant_text: this.assistantText,
        })
        .catch((err) => {
          // A persistence failure must never break the live session.
          // eslint-disable-next-line no-console
          console.warn("voice transcript post failed", err);
        });
    }
    this.userText = "";
    this.assistantText = "";
    this.emitCaption();
    this.setPhase("listening");
  }

  private handleServerError(event: { code?: string; message?: string }): void {
    if (event.code === "timeout" || event.code === "max_duration") {
      // A benign end-of-session signal — tear down cleanly, not as an error.
      this.finished = true;
      this.teardown();
      this.setPhase("ended");
      return;
    }
    this.fail(event.message ?? "The voice service reported an error.");
  }

  // ── Timers + teardown ──────────────────────────────────────────────────

  private scheduleMaxSession(maxMs: number): void {
    if (!Number.isFinite(maxMs) || maxMs <= 0) return;
    this.maxSessionTimer = setTimeout(() => {
      if (this.finished) return;
      this.finished = true;
      this.teardown();
      this.setPhase("ended");
    }, maxMs);
  }

  private teardown(): void {
    if (this.maxSessionTimer !== null) {
      clearTimeout(this.maxSessionTimer);
      this.maxSessionTimer = null;
    }
    try {
      this.seams.audio.stopCapture();
      this.seams.audio.flush();
      this.seams.audio.close();
    } catch {
      /* audio already torn down — ignore */
    }
    try {
      this.socket?.close();
    } catch {
      /* socket already closed — ignore */
    }
    this.socket = null;
  }

  private fail(message: string): void {
    this.finished = true;
    this.teardown();
    this.error = message;
    this.setPhase("error");
  }

  // ── Emit helpers ─────────────────────────────────────────────────────────

  private send(event: ClientEvent): void {
    if (!this.socket) return;
    try {
      this.socket.send(JSON.stringify(event));
    } catch {
      /* a send on a closing socket is not fatal — the close/error path wins */
    }
  }

  private snapshot(): VoiceSessionState {
    return { phase: this.phase, error: this.error };
  }

  private setPhase(phase: VoicePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    const snap = this.snapshot();
    for (const cb of this.stateListeners) cb(snap);
  }

  private emitCaption(): void {
    const caption: VoiceCaption = {
      user: this.userText,
      assistant: this.assistantText,
    };
    for (const cb of this.captionListeners) cb(caption);
  }

  private emitTools(): void {
    const list = this.toolActivities;
    for (const cb of this.toolListeners) cb(list);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

/** Stringify a tool result; a circular/unserializable shape degrades to error. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable_tool_output" });
  }
}

// Type used by ServerEvent narrowing above; re-export nothing (internal only).
export type { ServerEvent };
