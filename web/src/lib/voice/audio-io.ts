/**
 * Real, DOM-bound implementations of the VoiceSession seams — the only place
 * in the voice web client that touches `AudioContext`, `getUserMedia`,
 * `AudioWorklet`, and `WebSocket`. The state machine (`voice-session.ts`) stays
 * pure and framework-free; jsdom tests inject fakes for all of these, so this
 * module is exercised only by `typecheck` (jsdom has none of these APIs).
 *
 * Capture uses an AudioWorklet whose source is an INLINE Blob URL (no `public/`
 * asset, no deprecated `ScriptProcessorNode`). Playback is a queue of
 * `AudioBufferSourceNode`s scheduled back-to-back at the same context rate;
 * `flush()` stops + clears the queue for barge-in.
 */

import type { VoiceAudioIO, VoiceSocket } from "@/lib/voice/voice-session";
import {
  base64ToInt16,
  float32ToInt16,
  int16ToBase64,
  int16ToFloat32,
  nearestSupportedRate,
} from "@/lib/voice/voice-protocol";

/** ~100 ms of audio per uplink chunk (plan §3). */
const CHUNK_SECONDS = 0.1;

/**
 * AudioWorklet processor source (inlined). It forwards each 128-sample mono
 * frame to the main thread, which batches ~100 ms before uplinking. Kept tiny —
 * all the batching/encoding lives on the main thread where the PCM helpers are.
 */
const CAPTURE_WORKLET_SRC = `
class OakCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Copy the frame out of the shared render buffer before posting.
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('oak-capture', OakCaptureProcessor);
`;

export class BrowserVoiceAudioIO implements VoiceAudioIO {
  readonly sampleRate: number;

  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  // Uplink batching.
  private pending: Float32Array[] = [];
  private pendingLength = 0;
  private chunkSamples: number;

  // Playback scheduling.
  private playSources: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;

  constructor() {
    const AudioCtx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    // Request a supported rate up front so capture + playback + the rate we
    // advertise to xAI all agree.
    const probe = new AudioCtx();
    const target = nearestSupportedRate(probe.sampleRate);
    void probe.close();
    this.ctx =
      target === probe.sampleRate ? new AudioCtx() : new AudioCtx({ sampleRate: target });
    this.sampleRate = this.ctx.sampleRate;
    this.chunkSamples = Math.round(this.sampleRate * CHUNK_SECONDS);
  }

  async startCapture(onChunk: (base64Pcm16: string) => void): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const url = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET_SRC], { type: "application/javascript" }),
    );
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.ctx, "oak-capture");
    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      this.accumulate(e.data, onChunk);
    };
    // Intentionally do NOT connect the worklet to destination — routing the mic
    // to the speakers would echo.
    this.source.connect(this.workletNode);
  }

  private accumulate(
    frame: Float32Array,
    onChunk: (base64Pcm16: string) => void,
  ): void {
    this.pending.push(frame);
    this.pendingLength += frame.length;
    while (this.pendingLength >= this.chunkSamples) {
      const merged = new Float32Array(this.pendingLength);
      let offset = 0;
      for (const f of this.pending) {
        merged.set(f, offset);
        offset += f.length;
      }
      const chunk = merged.subarray(0, this.chunkSamples);
      const rest = merged.subarray(this.chunkSamples);
      onChunk(int16ToBase64(float32ToInt16(chunk)));
      this.pending = rest.length > 0 ? [rest.slice(0)] : [];
      this.pendingLength = rest.length;
    }
  }

  stopCapture(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.pending = [];
    this.pendingLength = 0;
  }

  enqueue(base64Pcm16: string): void {
    const float = int16ToFloat32(base64ToInt16(base64Pcm16));
    if (float.length === 0) return;
    const buffer = this.ctx.createBuffer(1, float.length, this.sampleRate);
    // `.set` on the buffer's own channel avoids the strict typed-array generic
    // mismatch `copyToChannel` trips on (Float32Array<ArrayBufferLike>).
    buffer.getChannelData(0).set(float);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
    node.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    node.onended = () => {
      this.playSources = this.playSources.filter((s) => s !== node);
    };
    this.playSources.push(node);
  }

  flush(): void {
    for (const node of this.playSources) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        /* already stopped — ignore */
      }
    }
    this.playSources = [];
    this.nextStartTime = 0;
  }

  close(): void {
    this.stopCapture();
    this.flush();
    void this.ctx.close();
  }
}

/**
 * A browser `WebSocket` wrapped to the {@link VoiceSocket} seam. The ephemeral
 * token rides as the client-secret subprotocol (browsers strip auth headers on
 * upgrade).
 */
export function browserConnect(url: string, subprotocol: string): VoiceSocket {
  const ws = new WebSocket(url, subprotocol);
  return {
    send: (data) => ws.send(data),
    close: () => {
      try {
        ws.close();
      } catch {
        /* already closing — ignore */
      }
    },
    onOpen: (cb) => ws.addEventListener("open", () => cb()),
    onMessage: (cb) =>
      ws.addEventListener("message", (e: MessageEvent) => {
        if (typeof e.data === "string") cb(e.data);
      }),
    onClose: (cb) => ws.addEventListener("close", () => cb()),
    onError: (cb) => ws.addEventListener("error", (e) => cb(e)),
  };
}
