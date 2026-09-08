/**
 * VoiceOverlay tests — render the overlay with a fake-seam VoiceSession injected
 * via `createSession`, then drive it through a scripted fake socket. No real
 * WebSocket/AudioContext is touched (jsdom has neither).
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import VoiceOverlay from "./VoiceOverlay";
import {
  VoiceSession,
  type VoiceAudioIO,
  type VoiceSocket,
  type VoiceSessionSeams,
} from "@/lib/voice/voice-session";
import type { VoiceSessionBootstrap } from "@/lib/voice/voice-types";

afterEach(() => cleanup());

class FakeSocket implements VoiceSocket {
  private openCb: (() => void) | null = null;
  private msgCb: ((d: string) => void) | null = null;
  closed = false;
  send(): void {}
  close(): void {
    this.closed = true;
  }
  onOpen(cb: () => void): void {
    this.openCb = cb;
  }
  onMessage(cb: (d: string) => void): void {
    this.msgCb = cb;
  }
  onClose(): void {}
  onError(): void {}
  emitOpen(): void {
    this.openCb?.();
  }
  emit(event: object): void {
    this.msgCb?.(JSON.stringify(event));
  }
}

class FakeAudio implements VoiceAudioIO {
  sampleRate = 48000;
  async startCapture(): Promise<void> {}
  stopCapture(): void {}
  enqueue(): void {}
  flush(): void {}
  close(): void {}
}

const bootstrap: VoiceSessionBootstrap = {
  model: "grok-voice-latest",
  voice: "rex",
  instructions: "dex voice",
  reasoning_effort: "none",
  idle_timeout_ms: 30_000,
  max_session_ms: 600_000,
  tools: [{ type: "function", name: "get_move", description: "", parameters: {} }],
};

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(open = true) {
  const socket = new FakeSocket();
  const seams: VoiceSessionSeams = {
    connect: () => socket,
    audio: new FakeAudio(),
    fetchToken: async () => ({ token: "tok", expires_at: 0, session: bootstrap }),
    execTool: async () => ({ output: {} }),
    postTranscript: async () => {},
    now: () => 0,
  };
  const createSession = () =>
    new VoiceSession({ sessionId: "conv-1", format: "champions", seams });
  const onClose = vi.fn();
  return { socket, onClose, createSession, open };
}

async function renderOpen(env: ReturnType<typeof setup>) {
  await act(async () => {
    render(
      <VoiceOverlay
        open={env.open}
        onClose={env.onClose}
        sessionId="conv-1"
        format="champions"
        createSession={env.createSession}
      />,
    );
    await tick();
  });
  await act(async () => {
    env.socket.emitOpen();
    await tick();
  });
}

describe("VoiceOverlay", () => {
  it("renders nothing when closed", () => {
    render(
      <VoiceOverlay
        open={false}
        onClose={() => {}}
        sessionId="conv-1"
        format="champions"
        createSession={() => {
          throw new Error("should not build a session while closed");
        }}
      />,
    );
    expect(screen.queryByTestId("voice-overlay")).not.toBeInTheDocument();
  });

  it("opens, connects, and shows the Listening phase", async () => {
    const env = setup();
    await renderOpen(env);
    expect(screen.getByTestId("voice-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("voice-phase")).toHaveTextContent("Listening");
  });

  it("renders live user + assistant captions", async () => {
    const env = setup();
    await renderOpen(env);
    await act(async () => {
      env.socket.emit({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "how fast is garchomp",
      });
      env.socket.emit({ type: "response.created" });
      env.socket.emit({
        type: "response.output_audio_transcript.delta",
        delta: "Base one-oh-two Speed.",
      });
      await tick();
    });
    expect(screen.getByTestId("voice-caption-user")).toHaveTextContent(
      "how fast is garchomp",
    );
    expect(screen.getByTestId("voice-caption-assistant")).toHaveTextContent(
      "Base one-oh-two Speed.",
    );
  });

  it("renders a tool-activity ticker entry when the model calls a tool", async () => {
    const env = setup();
    await renderOpen(env);
    await act(async () => {
      env.socket.emit({
        type: "response.function_call_arguments.done",
        name: "get_move",
        call_id: "call_1",
        arguments: "{}",
      });
      await tick();
    });
    const ticker = screen.getByTestId("voice-tools");
    expect(ticker).toHaveTextContent("get move");
    expect(ticker.textContent).not.toContain("GET_MOVE");
  });

  it("shows an error message on a non-timeout server error", async () => {
    const env = setup();
    await renderOpen(env);
    await act(async () => {
      env.socket.emit({ type: "error", code: "server_fault", message: "boom" });
      await tick();
    });
    expect(screen.getByTestId("voice-error")).toHaveTextContent("boom");
  });

  it("shows the rejected type from nested invalid_event params", async () => {
    const env = setup();
    await renderOpen(env);
    const params =
      "1 validation error for RealtimeClientEvent\ntype\n  Input should be '<enum>' [type=enum, input_value='not.a.real.event', input_type=str]";
    await act(async () => {
      env.socket.emit({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "invalid_event",
          message: "Invalid event received",
          params,
        },
      });
      await tick();
    });
    expect(screen.getByTestId("voice-error")).toHaveTextContent(
      "Invalid event received (rejected type: not.a.real.event)",
    );
  });

  it("End button ends the session and calls onClose", async () => {
    const env = setup();
    await renderOpen(env);
    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-end"));
    });
    expect(env.onClose).toHaveBeenCalledTimes(1);
    expect(env.socket.closed).toBe(true);
  });
});
