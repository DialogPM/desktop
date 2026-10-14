// "Anonymized voice" for voice notes: when on (this device only, off by default), every
// recording is masked by the core (crates/chat-core/src/voice_mask.rs) before it is sent, so
// the original voice never leaves this device.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { IS_TAURI } from "./api";

const KEY = "chatapp-voice-mask";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface Store {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export const useVoiceMask = create<Store>()((set) => ({
  enabled: load(),
  setEnabled: (enabled) => {
    set({ enabled });
    try {
      localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
}));

/** Whether this app can mask voices (the masking runs in the native core). */
export const VOICE_MASK_AVAILABLE = IS_TAURI;

/** Masks the voice in a base64 WAV recording; returns the masked WAV (base64, 16 kHz mono). */
export async function maskVoice(wavBase64: string): Promise<string> {
  return invoke<string>("voice_mask", { dataBase64: wavBase64 });
}

/** Records `ms` of microphone audio as a 16 kHz WAV (the "try it" sample in the settings). */
export async function recordSample(ms: number): Promise<Uint8Array> {
  const { encodeWav } = await import("./wav");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  try {
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const chunks: Float32Array[] = [];
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    await new Promise((r) => window.setTimeout(r, ms));
    proc.onaudioprocess = null;
    return encodeWav(chunks, ctx.sampleRate);
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
    void ctx.close().catch(() => undefined);
  }
}
