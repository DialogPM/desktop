// Mirrors the webview's console warnings/errors (and uncaught errors) into the app's own
// log (stderr of `tauri dev` / the app), so problems are visible without opening devtools.

import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "./api";

type Level = "info" | "warn" | "error";

function stringify(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function forward(level: Level, args: unknown[]) {
  const message = args.map(stringify).join(" ").slice(0, 4000);
  void invoke("ui_log", { level, message }).catch(() => undefined);
}

if (IS_TAURI) {
  for (const level of ["info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      forward(level, args);
    };
  }
  window.addEventListener("error", (e) => forward("error", [`uncaught: ${e.message} at ${e.filename}:${e.lineno}`]));
  window.addEventListener("unhandledrejection", (e) => forward("error", ["unhandled rejection:", e.reason]));
}
