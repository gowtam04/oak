import { describe, it, expect } from "vitest";
import {
  base64ToInt16,
  clientSecretSubprotocol,
  float32ToInt16,
  int16ToBase64,
  int16ToFloat32,
  nearestSupportedRate,
  parseServerEvent,
  realtimeUrl,
  voiceToolLabel,
} from "./voice-protocol";

describe("voice-protocol — connection helpers", () => {
  it("builds the realtime URL with an encoded model param", () => {
    expect(realtimeUrl("grok-voice-latest")).toBe(
      "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
    );
  });

  it("prefixes the ephemeral token as the client-secret subprotocol", () => {
    expect(clientSecretSubprotocol("abc123")).toBe("xai-client-secret.abc123");
  });
});

describe("voice-protocol — nearestSupportedRate", () => {
  it("returns a supported rate unchanged", () => {
    expect(nearestSupportedRate(48000)).toBe(48000);
    expect(nearestSupportedRate(44100)).toBe(44100);
  });

  it("snaps an exotic rate to the nearest supported one", () => {
    expect(nearestSupportedRate(47000)).toBe(48000);
    expect(nearestSupportedRate(45000)).toBe(44100);
    expect(nearestSupportedRate(100)).toBe(8000);
    expect(nearestSupportedRate(1_000_000)).toBe(48000);
  });
});

describe("voice-protocol — PCM conversion", () => {
  it("round-trips Int16 through base64 (little-endian)", () => {
    const pcm = Int16Array.from([0, 1, -1, 32767, -32768, 12345, -12345]);
    const restored = base64ToInt16(int16ToBase64(pcm));
    expect(Array.from(restored)).toEqual(Array.from(pcm));
  });

  it("encodes as little-endian bytes", () => {
    // 0x0102 → bytes [0x02, 0x01]; base64 of [0x02,0x01] is "AgE=".
    expect(int16ToBase64(Int16Array.from([0x0102]))).toBe("AgE=");
  });

  it("drops a trailing odd byte when decoding", () => {
    // atob("AAAA") → 3 bytes; only one full sample decodes.
    expect(base64ToInt16("AAAA").length).toBe(1);
  });

  it("converts Float32 to clamped Int16 and back", () => {
    const f = Float32Array.from([0, 1, -1, 2, -2, 0.5]);
    const i = float32ToInt16(f);
    expect(i[0]).toBe(0);
    expect(i[1]).toBe(32767); // 1.0 → max
    expect(i[2]).toBe(-32768); // -1.0 → min
    expect(i[3]).toBe(32767); // clamped from 2.0
    expect(i[4]).toBe(-32768); // clamped from -2.0
    // Round-trip stays close to the original.
    const back = int16ToFloat32(i);
    expect(back[5]).toBeCloseTo(0.5, 3);
  });
});

describe("voice-protocol — parseServerEvent", () => {
  it("returns null for malformed JSON or a missing type", () => {
    expect(parseServerEvent("not json")).toBeNull();
    expect(parseServerEvent("null")).toBeNull();
    expect(parseServerEvent(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "unknown.event" }))).toBeNull();
  });

  it("parses simple no-payload events", () => {
    expect(parseServerEvent(JSON.stringify({ type: "response.done" }))).toEqual(
      { type: "response.done" },
    );
    expect(
      parseServerEvent(
        JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      ),
    ).toEqual({ type: "input_audio_buffer.speech_started" });
  });

  it("normalizes aliased audio + transcript delta names", () => {
    expect(
      parseServerEvent(JSON.stringify({ type: "response.audio.delta", delta: "AA==" })),
    ).toEqual({ type: "response.output_audio.delta", delta: "AA==" });
    expect(
      parseServerEvent(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "hi" }),
      ),
    ).toEqual({ type: "response.output_audio_transcript.delta", delta: "hi" });
    expect(
      parseServerEvent(
        JSON.stringify({ type: "response.audio_transcript.done" }),
      ),
    ).toEqual({ type: "response.output_audio_transcript.done" });
  });

  it("parses a completed user transcription", () => {
    expect(
      parseServerEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "how fast is garchomp",
        }),
      ),
    ).toEqual({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "how fast is garchomp",
    });
  });

  it("parses a function call and rejects one missing fields", () => {
    expect(
      parseServerEvent(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "get_move",
          call_id: "call_1",
          arguments: '{"name":"earthquake"}',
        }),
      ),
    ).toEqual({
      type: "response.function_call_arguments.done",
      name: "get_move",
      call_id: "call_1",
      arguments: '{"name":"earthquake"}',
    });
    expect(
      parseServerEvent(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "get_move",
        }),
      ),
    ).toBeNull();
  });

  it("parses ping (with and without timestamp) and error", () => {
    expect(
      parseServerEvent(JSON.stringify({ type: "ping", ping_timestamp: 42 })),
    ).toEqual({ type: "ping", ping_timestamp: 42 });
    expect(parseServerEvent(JSON.stringify({ type: "ping" }))).toEqual({
      type: "ping",
      ping_timestamp: undefined,
    });
    expect(
      parseServerEvent(
        JSON.stringify({ type: "error", code: "timeout", message: "gone" }),
      ),
    ).toEqual({ type: "error", code: "timeout", message: "gone" });
  });
});

describe("voice-protocol — voiceToolLabel", () => {
  it("maps known tools to friendly labels and falls back otherwise", () => {
    expect(voiceToolLabel("get_move")).toContain("move");
    expect(voiceToolLabel("resolve_entity")).toContain("Resolving");
    expect(voiceToolLabel("mystery_tool")).toBe("Running mystery_tool…");
  });
});
