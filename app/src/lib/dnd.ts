// Do not disturb: incoming calls do not ring (the core turns them into missed calls) and new
// messages make no sound and show no notification. The setting lives in the core and is synced
// to our other devices; this store mirrors it and ends it on time.

import { create } from "zustand";
import i18n from "../i18n";
import { api } from "./api";
import { DND_FOREVER } from "./types";

export type DndChoice = "1h" | "8h" | "morning" | "forever";
export const DND_CHOICES: DndChoice[] = ["1h", "8h", "morning", "forever"];

const HOUR = 3_600_000;
/** Ends at or beyond this (ms) mean "until I turn it off" (the core stores i64::MAX). */
const FOREVER_FROM = 1e15;
/** Longest delay setTimeout accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export const useDnd = create<{ until: number }>(() => ({ until: 0 }));

let expiryTimer = 0;

/** Mirrors the core's state (`until` 0 = off) and schedules the automatic end. */
export function applyDnd(until: number) {
  window.clearTimeout(expiryTimer);
  const now = Date.now();
  const v = until > now ? until : 0;
  useDnd.setState({ until: v });
  if (v && !isDndForever(v)) {
    // Long waits are re-armed in steps (setTimeout overflows past ~24 days).
    expiryTimer = window.setTimeout(() => applyDnd(useDnd.getState().until), Math.min(v - now + 50, MAX_TIMER_MS));
  }
}

export function dndActive(): boolean {
  return useDnd.getState().until > Date.now();
}

export function isDndForever(until: number): boolean {
  return until >= FOREVER_FROM;
}

/** End time of a choice; "morning" is the next 08:00. */
export function dndUntil(choice: DndChoice, now = new Date()): number {
  switch (choice) {
    case "1h":
      return now.getTime() + HOUR;
    case "8h":
      return now.getTime() + 8 * HOUR;
    case "morning": {
      const d = new Date(now);
      d.setHours(8, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case "forever":
      return DND_FOREVER;
  }
}

export async function setDnd(until: number) {
  const st = await api.setDnd({ until });
  applyDnd(st.until);
}

export async function loadDnd() {
  try {
    applyDnd((await api.getDnd()).until);
  } catch {
    /* older core: stays off */
  }
}

/** "Until 21:30", "Until Tue 08:00" or "Until you turn it off". */
export function dndUntilText(until: number): string {
  const t = i18n.t.bind(i18n);
  if (isDndForever(until)) return t("dnd.untilOff");
  const d = new Date(until);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const when = sameDay ? time : `${d.toLocaleDateString(i18n.language, { weekday: "short" })} ${time}`;
  return t("dnd.untilTime", { time: when });
}
