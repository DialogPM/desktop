// Notification sounds, synthesized with the Web Audio API (no audio files to bundle, works
// offline and under the strict CSP). Webviews only allow audio after a user gesture, so the
// audio context is unlocked on the first click / key press.
//
// In the desktop app the same tones are played natively (src-tauri/src/sounds.rs): WebKit
// suspends the AudioContext while the window is in the background, which delayed the message
// sound by seconds.

import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "./api";

function native(name: "incoming" | "in_chat" | "ringtone" | "ringback"): boolean {
  if (!IS_TAURI) return false;
  void invoke("play_sound", { name }).catch((e: unknown) => console.warn("sound", e));
  return true;
}

let ctx: AudioContext | null = null;
let lastPlayed = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

function unlock() {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

/** One soft bell-like note: sine + a quiet octave, fast attack, exponential decay. */
function note(c: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(c.destination);
  for (const [mult, level] of [
    [1, 1],
    [2, 0.18],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = level;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, start);
    osc.connect(g).connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}

function play(name: "incoming" | "in_chat", fn: (c: AudioContext, t: number) => void) {
  const now = Date.now();
  // Bursts of messages produce a single sound.
  if (now - lastPlayed < 900) return;
  lastPlayed = now;
  if (native(name)) return;
  const c = context();
  if (!c) return;
  const run = () => fn(c, c.currentTime + 0.02);
  if (c.state === "suspended") void c.resume().then(run).catch(() => undefined);
  else run();
}

/** New message in a chat that is not open (or the app is in the background). */
export function playIncoming() {
  play("incoming", (c, t) => {
    note(c, 880, t, 0.32, 0.16); // A5
    note(c, 1318.5, t + 0.11, 0.42, 0.13); // E6
  });
}

/** New message in the chat currently open: short and quieter. */
export function playInChat() {
  play("in_chat", (c, t) => note(c, 987.8, t, 0.16, 0.07)); // B5
}

/** Repeats a pattern until the returned function is called (ringtone, ringback). */
function loop(pattern: (c: AudioContext, t: number) => void, everyMs: number): () => void {
  const c = context();
  if (!c) return () => undefined;
  const run = () => {
    if (c.state === "suspended") void c.resume().catch(() => undefined);
    pattern(c, c.currentTime + 0.02);
  };
  run();
  const timer = window.setInterval(run, everyMs);
  return () => window.clearInterval(timer);
}

/** Desktop: an incoming call brings the window to the front and bounces the Dock icon /
 * flashes the taskbar until answered (src-tauri/src/attention.rs). */
function callAttention(on: boolean) {
  if (IS_TAURI) void invoke("call_attention", { on }).catch((e: unknown) => console.warn("call attention", e));
}

/** Incoming call: a two-tone chime every 2 s; on the desktop the window also comes forward. */
export function startRingtone(): () => void {
  callAttention(true);
  if (native("ringtone")) {
    return () => {
      callAttention(false);
      stopNative();
    };
  }
  return loop((c, t) => {
    for (const offset of [0, 0.32]) {
      note(c, 784, t + offset, 0.28, 0.2); // G5
      note(c, 1046.5, t + offset + 0.14, 0.32, 0.17); // C6
    }
  }, 2000);
}

/** Outgoing call while the other side rings: a soft tone every 3 s. */
export function startRingback(): () => void {
  if (native("ringback")) return stopNative;
  return loop((c, t) => {
    note(c, 440, t, 1.1, 0.06);
    note(c, 480, t, 1.1, 0.05);
  }, 3000);
}

function stopNative() {
  void invoke("stop_sound").catch(() => undefined);
}
