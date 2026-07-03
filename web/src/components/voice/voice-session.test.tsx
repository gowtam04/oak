/**
 * VoiceSession state-machine tests. Drives the machine through FAKE seams
 * (scripted socket + fake audio) — never a real WebSocket/AudioContext.
 *
 * Located under `src/components/voice/` (not beside the source in `lib/voice/`)
 * because the vitest jsdom project only collects `src/components/ ** /*.test.tsx`;
 * a `.test.tsx` under `lib/` would be collected by neither project. The module
 * under test is imported by path, so the file's location is immaterial.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  VoiceSession,
  type VoiceAudioIO,
  type VoicePhase,
  type VoiceSocket,
  type VoiceSessionSeams,
} from "@/lib/voice/voice-session";
import type { VoiceSessionBootstrap } from "@/lib/voice/voice-types";

// ── Fakes ────────────────────────────────────────────────────────────────

class FakeSocket implements VoiceSocket {
  sent: string[] = [];
  closed = false;
  private openCb: (() => void) | null = null;
  private msgCb: ((d: string) => void) | null = null;
  private closeCb: (() => void) | null = null;
  private errCb: ((e: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  onOpen(cb: () => void): void {
    this.openCb = cb;
  }
  onMessage(cb: (d: string) => void): void {
    this.msgCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  onError(cb: (e: unknown) => void): void {
    this.errCb = cb;
  }

  // Test drivers.
  emitOpen(): void {
    this.openCb?.();
  }
  emit(event: object): void {
    this.msgCb?.(JSON.stringify(event));
  }
  emitClose(): void {
    this.closeCb?.();
  }
  emitError(e: unknown): void {
    this.errCb?.(e);
  }
  sentEvents(): { type: string; [k: string]: unknown }[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

class FakeAudio implements VoiceAudioIO {
  sampleRate = 48000;
  captureCb: ((b64: string) => void) | null = null;
  captureStarted = false;
  stopped = false;
  closed = false;
  flushed = 0;
  enqueued: string[] = [];

  async startCapture(cb: (b64: string) => void): Promise<void> {
    this.captureStarted = true;
    this.captureCb = cb;
  }
  stopCapture(): void {
    this.stopped = true;
  }
  enqueue(b64: string): void {
    this.enqueued.push(b64);
  }
  flush(): void {
    this.flushed += 1;
  }
  close(): void {
    this.closed = true;
  }
}

function bootstrap(
  overrides: Partial<VoiceSessionBootstrap> = {},
): VoiceSessionBootstrap {
  return {
    model: "grok-voice-latest",
    voice: "rex",
    instructions: "You are Oak's Pokédex voice.",
    reasoning_effort: "none",
    idle_timeout_ms: 30_000,
    max_session_ms: 600_000,
    tools: [
      { type: "function", name: "get_move", description: "look up a move", parameters: {} },
    ],
    ...overrides,
  };
}

function harness(overrides: Partial<VoiceSessionBootstrap> = {}) {
  const socket = new FakeSocket();
  const audio = new FakeAudio();
  const boot = bootstrap(overrides);
  const execTool = vi.fn(async (body: { name: string }) => ({
    output: { called: body.name },
  }));
  const postTranscript = vi.fn(async () => {});
  const fetchToken = vi.fn(async () => ({
    token: "tok-123",
    expires_at: 0,
    session: boot,
  }));
  const seams: VoiceSessionSeams = {
    connect: () => socket,
    audio,
    fetchToken,
    execTool,
    postTranscript,
    now: () => 1000,
  };
  const session = new VoiceSession({
    sessionId: "conv-1",
    format: "champions",
    seams,
  });
  const phases: VoicePhase[] = [];
  session.onState((s) => phases.push(s.phase));
  return {
    session,
    socket,
    audio,
    execTool,
    postTranscript,
    fetchToken,
    boot,
    phases,
    phase: () => session.getPhase(),
  };
}

/** Flush pending micro + macro tasks (real timers). */
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Bring a session up to the "listening" phase. */
async function connect(h: ReturnType<typeof harness>) {
  await h.session.start();
  h.socket.emitOpen();
  await tick();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("VoiceSession — connection + configuration", () => {
  it("progresses idle → connecting → listening and sends session.update", async () => {
    const h = harness();
    expect(h.phase()).toBe("idle");

    const started = h.session.start();
    expect(h.phase()).toBe("connecting");
    await started;
    h.socket.emitOpen();
    await tick();

    expect(h.phase()).toBe("listening");
    expect(h.fetchToken).toHaveBeenCalledWith({
      session_id: "conv-1",
      format: "champions",
    });
    expect(h.audio.captureStarted).toBe(true);

    const first = h.socket.sentEvents()[0]!;
    expect(first.type).toBe("session.update");
    const session = first.session as {
      audio: { input: { format: { rate: number } } };
      tools: unknown[];
      voice: string;
    };
    expect(session.voice).toBe("rex");
    expect(session.audio.input.format.rate).toBe(48000);
    expect(session.tools).toHaveLength(1);
  });

  it("streams captured mic chunks as input_audio_buffer.append", async () => {
    const h = harness();
    await connect(h);
    h.audio.captureCb?.("BASE64CHUNK");
    const appends = h.socket
      .sentEvents()
      .filter((e) => e.type === "input_audio_buffer.append");
    expect(appends).toHaveLength(1);
    expect(appends[0]!.audio).toBe("BASE64CHUNK");
  });

  it("fails cleanly when token minting throws", async () => {
    const h = harness();
    h.fetchToken.mockRejectedValueOnce(new Error("mint 502"));
    await h.session.start();
    await tick();
    expect(h.phase()).toBe("error");
  });
});

describe("VoiceSession — turn phases + barge-in", () => {
  it("enters thinking on response.created and speaking on audio delta", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({ type: "response.created" });
    expect(h.phase()).toBe("thinking");
    h.socket.emit({ type: "response.output_audio.delta", delta: "AA==" });
    expect(h.phase()).toBe("speaking");
    expect(h.audio.enqueued).toEqual(["AA=="]);
  });

  it("flushes playback on barge-in (speech_started) and returns to listening", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({ type: "response.output_audio.delta", delta: "AA==" });
    expect(h.phase()).toBe("speaking");
    const flushesBefore = h.audio.flushed;

    h.socket.emit({ type: "input_audio_buffer.speech_started" });
    expect(h.audio.flushed).toBeGreaterThan(flushesBefore);
    expect(h.phase()).toBe("listening");
  });

  it("answers a ping with a pong echoing the timestamp", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({ type: "ping", ping_timestamp: 777 });
    const pong = h.socket.sentEvents().find((e) => e.type === "pong");
    expect(pong).toEqual({ type: "pong", ping_timestamp: 777 });
  });
});

describe("VoiceSession — tool calls", () => {
  it("executes parallel calls, sends all outputs, THEN one response.create", async () => {
    const h = harness();
    await connect(h);
    const before = h.socket.sent.length;

    h.socket.emit({
      type: "response.function_call_arguments.done",
      name: "get_move",
      call_id: "call_1",
      arguments: '{"name":"earthquake"}',
    });
    h.socket.emit({
      type: "response.function_call_arguments.done",
      name: "get_move",
      call_id: "call_2",
      arguments: '{"name":"surf"}',
    });
    h.socket.emit({ type: "response.done" });
    await tick();

    expect(h.execTool).toHaveBeenCalledTimes(2);
    const after = h.socket.sentEvents().slice(before);
    const outputs = after.filter(
      (e) => e.type === "conversation.item.create",
    );
    const creates = after.filter((e) => e.type === "response.create");
    expect(outputs).toHaveLength(2);
    expect(creates).toHaveLength(1);
    // The single response.create comes strictly after both outputs.
    const outputIdxs = after
      .map((e, i) => (e.type === "conversation.item.create" ? i : -1))
      .filter((i) => i >= 0);
    const lastOutputIdx = outputIdxs[outputIdxs.length - 1]!;
    const createIdx = after.findIndex((e) => e.type === "response.create");
    expect(createIdx).toBeGreaterThan(lastOutputIdx);

    // Each output carries its call_id and a JSON-string output.
    const callIds = outputs.map(
      (e) => (e.item as { call_id: string }).call_id,
    );
    expect(callIds.sort()).toEqual(["call_1", "call_2"]);
    expect(
      typeof (outputs[0]!.item as { output: unknown }).output,
    ).toBe("string");
  });

  it("surfaces each call as a tool-activity entry", async () => {
    const h = harness();
    await connect(h);
    const activities: string[] = [];
    h.session.onToolActivity((list) => {
      activities.length = 0;
      activities.push(...list.map((a) => a.tool));
    });
    h.socket.emit({
      type: "response.function_call_arguments.done",
      name: "get_move",
      call_id: "call_1",
      arguments: "{}",
    });
    expect(activities).toEqual(["get_move"]);
  });
});

describe("VoiceSession — transcript persistence", () => {
  it("posts the finished turn (user + assistant) on a spoken response.done", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "how fast is garchomp",
    });
    h.socket.emit({ type: "response.created" });
    h.socket.emit({
      type: "response.output_audio_transcript.delta",
      delta: "Base one-oh-two Speed.",
    });
    h.socket.emit({ type: "response.done" });
    await tick();

    expect(h.postTranscript).toHaveBeenCalledTimes(1);
    expect(h.postTranscript).toHaveBeenCalledWith({
      session_id: "conv-1",
      format: "champions",
      user_text: "how fast is garchomp",
      assistant_text: "Base one-oh-two Speed.",
    });
    expect(h.phase()).toBe("listening");
  });

  it("does NOT post when a turn has no assistant text (e.g. only a tool batch)", async () => {
    const h = harness();
    await connect(h);
    // A function-call response.done should not persist anything.
    h.socket.emit({
      type: "response.function_call_arguments.done",
      name: "get_move",
      call_id: "call_1",
      arguments: "{}",
    });
    h.socket.emit({ type: "response.done" });
    await tick();
    expect(h.postTranscript).not.toHaveBeenCalled();
  });

  it("keeps the session alive when transcript posting rejects", async () => {
    const h = harness();
    h.postTranscript.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await connect(h);
    h.socket.emit({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "hi",
    });
    h.socket.emit({ type: "response.created" });
    h.socket.emit({
      type: "response.output_audio_transcript.delta",
      delta: "hello",
    });
    h.socket.emit({ type: "response.done" });
    await tick();
    expect(h.phase()).toBe("listening"); // not "error"
  });
});

describe("VoiceSession — teardown", () => {
  it("end() stops capture, closes the socket, and marks ended", async () => {
    const h = harness();
    await connect(h);
    h.session.end();
    expect(h.audio.stopped).toBe(true);
    expect(h.audio.closed).toBe(true);
    expect(h.socket.closed).toBe(true);
    expect(h.phase()).toBe("ended");
  });

  it("treats a timeout error code as a clean end, not an error", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({ type: "error", code: "timeout", message: "idle" });
    expect(h.phase()).toBe("ended");
  });

  it("surfaces a non-timeout server error as phase error", async () => {
    const h = harness();
    await connect(h);
    h.socket.emit({ type: "error", code: "server_fault", message: "boom" });
    expect(h.phase()).toBe("error");
  });

  it("auto-ends at the max-session cap", async () => {
    vi.useFakeTimers();
    const h = harness({ max_session_ms: 5_000 });
    await h.session.start();
    h.socket.emitOpen();
    await vi.advanceTimersByTimeAsync(0); // let capture settle
    expect(h.phase()).toBe("listening");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.phase()).toBe("ended");
    expect(h.socket.closed).toBe(true);
  });
});
