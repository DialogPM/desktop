// Live voice effects for calls ("like TikTok"): the microphone goes through crates/voice-fx
// (WebAssembly in an AudioWorklet, voiceFx.worklet.js) and the processed track replaces the
// microphone in the call (RTCRtpSender.replaceTrack, no renegotiation). Effects are processed
// on this device: the other side only ever receives the changed voice. The same pipeline does
// the AI noise reduction (RNNoise). With no effect and no noise reduction the microphone track
// itself is sent, untouched, exactly as without this feature.

import { create } from "zustand";
import { VOICE_FX_WASM } from "./voiceFxWasm.gen";
// A real file (no-inline): the CSP allows worklet modules from the app itself, not data: URLs.
import workletUrl from "./voiceFx.worklet.js?url&no-inline";

export const VOICE_EFFECTS = ["none", "anonymous", "deep", "chipmunk", "robot", "hall"] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

/** Effect numbers of crates/voice-fx/src/lib.rs. */
const CODE: Record<VoiceEffect, number> = { none: 0, anonymous: 1, deep: 2, chipmunk: 3, robot: 4, hall: 5 };

export const VOICE_EFFECT_EMOJI: Record<VoiceEffect, string> = {
  none: "🎙️",
  anonymous: "🕶️",
  deep: "🐻",
  chipmunk: "🐿️",
  robot: "🤖",
  hall: "🎤",
};

const PREFS_KEY = "chatapp-call-audio";

/** "Noise reduction (AI)" for calls, kept on this device; off by default. */
export const useCallAudioPrefs = create<{ denoise: boolean; setDenoise: (on: boolean) => void }>()((set) => ({
  denoise: (() => {
    try {
      return localStorage.getItem(PREFS_KEY) === "denoise";
    } catch {
      return false;
    }
  })(),
  setDenoise: (denoise) => {
    set({ denoise });
    try {
      localStorage.setItem(PREFS_KEY, denoise ? "denoise" : "");
    } catch {
      /* ignore */
    }
  },
}));

let wasmBytes: Uint8Array | null = null;
function wasm(): Uint8Array {
  if (!wasmBytes) {
    // Embedded as base64 (scripts/build-voice-fx.mjs): the app's CSP does not allow fetching it.
    wasmBytes = Uint8Array.from(atob(VOICE_FX_WASM), (c) => c.charCodeAt(0));
  }
  return wasmBytes;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}

/** The microphone track going through the effects. */
class LiveVoiceFx {
  private constructor(
    private ctx: AudioContext,
    private node: AudioWorkletNode,
    readonly track: MediaStreamTrack,
  ) {}

  static async create(mic: MediaStreamTrack, effect: VoiceEffect, denoise: boolean): Promise<LiveVoiceFx> {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, "voice-fx", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        // A new random "anonymous" voice for every call.
        processorOptions: { wasm: wasm(), seed: randomSeed(), effect: CODE[effect], denoise },
      });
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(new MediaStream([mic])).connect(node).connect(dest);
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      // A context that does not run would send silence: the caller falls back to the microphone.
      if (ctx.state !== "running") throw new Error(`audio context ${ctx.state}`);
      return new LiveVoiceFx(ctx, node, dest.stream.getAudioTracks()[0]);
    } catch (e) {
      void ctx.close().catch(() => undefined);
      throw e;
    }
  }

  configure(effect: VoiceEffect, denoise: boolean) {
    this.node.port.postMessage({ effect: CODE[effect], denoise });
  }

  stop() {
    this.node.port.postMessage({ stop: true });
    this.track.stop();
    void this.ctx.close().catch(() => undefined);
  }
}

/**
 * The voice effect of one call. `senders` returns the audio senders of the call's peer
 * connections (one for a 1:1 call, one per participant in a group call).
 */
export class CallVoiceFx {
  effect: VoiceEffect = "none";
  denoise = false;
  private live: LiveVoiceFx | null = null;

  constructor(
    private mic: () => MediaStreamTrack | undefined,
    private senders: () => RTCRtpSender[],
  ) {}

  private get processing(): boolean {
    return this.effect !== "none" || this.denoise;
  }

  /** The audio track to send on a new peer connection. */
  outgoing(mic: MediaStreamTrack): MediaStreamTrack {
    return this.processing && this.live ? this.live.track : mic;
  }

  /** Applies an effect and/or the noise reduction. False when there is no microphone yet. */
  async set(change: { effect?: VoiceEffect; denoise?: boolean }): Promise<boolean> {
    const mic = this.mic();
    if (!mic) return false;
    const effect = change.effect ?? this.effect;
    const denoise = change.denoise ?? this.denoise;
    const processing = effect !== "none" || denoise;
    if (processing && !this.live) this.live = await LiveVoiceFx.create(mic, effect, denoise);
    this.live?.configure(effect, denoise);
    const track = processing ? this.live!.track : mic;
    await Promise.all(this.senders().map((s) => (s.track === track ? undefined : s.replaceTrack(track))));
    this.effect = effect;
    this.denoise = denoise;
    return true;
  }

  stop() {
    this.live?.stop();
    this.live = null;
    this.effect = "none";
    this.denoise = false;
  }
}

/** Audio senders of a peer connection (the microphone or its processed track). */
export function audioSenders(pc: RTCPeerConnection | null | undefined): RTCRtpSender[] {
  if (!pc || pc.signalingState === "closed") return [];
  return pc.getSenders().filter((s) => s.track?.kind === "audio");
}

/** Applies an effect to a whole recording (voice notes); `samples` is mono at `rate`. */
export async function applyEffect(samples: Float32Array, rate: number, effect: VoiceEffect): Promise<Float32Array> {
  if (effect === "none") return samples;
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(wasm() as BufferSource), {});
  const fx = instance.exports as unknown as {
    memory: WebAssembly.Memory;
    fx_new(rate: number, seed: number): number;
    fx_buffer(h: number): number;
    fx_set_effect(h: number, effect: number): void;
    fx_process(h: number, n: number): void;
    fx_free(h: number): void;
  };
  const h = fx.fx_new(rate, randomSeed());
  try {
    fx.fx_set_effect(h, CODE[effect]);
    const ptr = fx.fx_buffer(h);
    const out = new Float32Array(samples.length);
    for (let off = 0; off < samples.length; off += 1024) {
      const n = Math.min(1024, samples.length - off);
      const io = new Float32Array(fx.memory.buffer, ptr, n);
      io.set(samples.subarray(off, off + n));
      fx.fx_process(h, n);
      out.set(io, off);
    }
    return out;
  } finally {
    fx.fx_free(h);
  }
}
