// Turns local media paths (attachments, avatars) into URLs the webview can load.
//
// Preferred: the app's `chatmedia://` protocol (streams, supports seeking). Some webviews
// refuse custom schemes for media (seen on macOS WKWebView as "unsupported URL"), so the
// protocol is probed once and, if it does not work, files are read over IPC and shown as
// blob: URLs instead.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { IS_TAURI } from "./api";
import { reportIfMissingCommand } from "./staleBinary";

type Mode = "protocol" | "ipc";

let mode: Mode | null = null;
let probing: Promise<Mode> | null = null;

function protocolUrl(path: string): string {
  return convertFileSrc(path, "chatmedia");
}

function probeMode(): Promise<Mode> {
  if (mode) return Promise.resolve(mode);
  probing ??= (async (): Promise<Mode> => {
    try {
      // Debug override: localStorage "chatapp.mediaMode" or VITE_MEDIA_MODE = "ipc" | "protocol".
      const forced = window.localStorage.getItem("chatapp.mediaMode") ?? import.meta.env.VITE_MEDIA_MODE;
      if (forced === "ipc" || forced === "protocol") return (mode = forced);
      // WKWebView (macOS/iOS) rejects fetch() to custom schemes ("Cross origin requests are
      // only supported for HTTP"): use IPC directly instead of probing.
      if (/Macintosh|iPhone|iPad/.test(navigator.userAgent)) return (mode = "ipc");
    } catch {
      // Storage unavailable: probe normally.
    }
    try {
      const url = protocolUrl("__probe");
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      window.clearTimeout(timer);
      mode = res.ok && (await res.text()) === "ok" ? "protocol" : "ipc";
    } catch {
      mode = "ipc";
    }
    if (mode === "ipc") console.info("chatmedia protocol unavailable, loading media over IPC");
    return mode;
  })();
  return probing;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic",
  bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac",
};

function mimeOf(path: string, hint?: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "webm" && hint?.startsWith("audio/")) return "audio/webm";
  return MIME[ext] ?? hint ?? "application/octet-stream";
}

// Media files are written once under unique names, so a path always maps to the same bytes.
const blobUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | undefined>>();
const MAX_CACHED = 400;

function remember(path: string, url: string) {
  blobUrls.set(path, url);
  if (blobUrls.size > MAX_CACHED) {
    // Drop the oldest entry; its blob stays alive for elements still showing it.
    const oldest = blobUrls.keys().next().value;
    if (oldest !== undefined) blobUrls.delete(oldest);
  }
}

function isPassthrough(path: string): boolean {
  return /^(data:|blob:|https?:|asset:|chatmedia:)/.test(path);
}

/**
 * Audio and video are always played from blob: URLs. WebKit hands playback to the platform
 * media stack (AVFoundation / GStreamer), which cannot fetch custom schemes reliably, so
 * `chatmedia://` audio fails even where images load fine.
 */
function needsBlob(path: string, mimeHint?: string): boolean {
  return /^(audio|video)\//.test(mimeOf(path, mimeHint));
}

/** Synchronous best effort: a URL if one is known right now. */
export function peekMediaSrc(path: string | null | undefined, mimeHint?: string): string | undefined {
  if (!path) return undefined;
  if (isPassthrough(path) || !IS_TAURI) return path;
  if (mode === "protocol" && !needsBlob(path, mimeHint)) return protocolUrl(path);
  return blobUrls.get(path);
}

/**
 * Resolves a loadable URL for a local media file. `outsideDataDir` is for files the user
 * just picked (previews): the protocol only serves the app data directory, so those are
 * always read over IPC.
 */
export async function resolveMediaSrc(path: string, mimeHint?: string, outsideDataDir = false): Promise<string | undefined> {
  if (!outsideDataDir) {
    const now = peekMediaSrc(path, mimeHint);
    if (now) return now;
    if ((await probeMode()) === "protocol" && !needsBlob(path, mimeHint)) return protocolUrl(path);
  } else if (isPassthrough(path) || !IS_TAURI) {
    return path;
  } else if (blobUrls.has(path)) {
    return blobUrls.get(path);
  }
  let p = inflight.get(path);
  if (!p) {
    p = invoke<ArrayBuffer>("read_media", { path })
      .then((buf) => {
        const url = URL.createObjectURL(new Blob([buf], { type: mimeOf(path, mimeHint) }));
        remember(path, url);
        return url;
      })
      .catch((e) => {
        console.warn("read_media failed", path, e);
        reportIfMissingCommand(e);
        // e.g. a video too large for IPC: the protocol is still better than nothing.
        return !outsideDataDir && mode === "protocol" ? protocolUrl(path) : undefined;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/**
 * Drops a path from the cache and revokes its blob: URL (view-once media, whose file is about
 * to be deleted). Elements still showing the URL stop working.
 */
export function forgetMediaSrc(path: string) {
  const url = blobUrls.get(path);
  blobUrls.delete(path);
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/** React hook: a loadable URL for a local media path (undefined while loading or missing). */
export function useMediaSrc(path: string | null | undefined, mimeHint?: string): string | undefined {
  const [state, setState] = useState(() => ({ path, src: peekMediaSrc(path, mimeHint) }));
  useEffect(() => {
    let alive = true;
    if (path && !peekMediaSrc(path, mimeHint)) {
      void resolveMediaSrc(path, mimeHint).then((src) => {
        if (alive) setState({ path, src });
      });
    }
    return () => {
      alive = false;
    };
  }, [path, mimeHint]);
  // Never show the previous file's URL for a new path.
  return state.path === path ? state.src : peekMediaSrc(path, mimeHint);
}

// Start probing early so the first images do not wait for it.
if (IS_TAURI) void probeMode();
