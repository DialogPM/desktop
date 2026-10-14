// Thin wrappers around Tauri plugins with browser fallbacks.
// Components must use these instead of importing @tauri-apps/* directly.

import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IS_TAURI } from "./api";
import { peekMediaSrc, resolveMediaSrc } from "./media";
import type { OutgoingAttachment } from "./types";

/**
 * Turns a local file path into something usable as <img src>, if one is known right now.
 * Components should prefer `useMediaSrc` (lib/media.ts), which also handles webviews
 * where the `chatmedia` protocol does not work.
 */
export function fileSrc(path: string | null | undefined): string | undefined {
  return peekMediaSrc(path);
}

export interface PickedFile {
  name: string;
  mime: string;
  size: number | null;
  /** Opaque token of the picked file (Tauri), accepted by commands in place of a path. */
  path?: string;
  /** Browser file (fallback). */
  file?: File;
  /** Displayable URL (asset URL or data URL). */
  url: string;
}

export type PickKind = "image" | "media" | "any" | "contacts";

const EXT: Record<PickKind, string[] | null> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"],
  media: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "mp4", "mov", "webm", "mkv"],
  contacts: ["vcf", "csv"],
  any: null,
};

const ACCEPT: Record<PickKind, string> = {
  image: "image/*",
  media: "image/*,video/*",
  contacts: ".vcf,.csv,text/vcard,text/csv",
  any: "",
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  csv: "text/csv",
  vcf: "text/vcard",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const url = await fileToDataUrl(blob);
  return url.slice(url.indexOf(",") + 1);
}

export function pickedFromFile(file: File): PickedFile {
  return {
    name: file.name || "file",
    mime: file.type || mimeFromName(file.name),
    size: file.size,
    file,
    url: URL.createObjectURL(file),
  };
}

function browserPick(kind: PickKind, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (ACCEPT[kind]) input.accept = ACCEPT[kind];
    input.style.display = "none";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Opens a native file dialog (Tauri) or an <input type=file> (browser). */
export async function pickFiles(opts: { kind?: PickKind; multiple?: boolean } = {}): Promise<PickedFile[]> {
  const kind = opts.kind ?? "any";
  const multiple = opts.multiple ?? false;
  if (IS_TAURI) {
    // The native dialog runs in Rust, which hands out opaque tokens instead of file paths
    // (commands accept only those; see src-tauri/src/picked.rs).
    const picked = await invoke<{ path: string; name: string; size: number | null }[]>("pick_files", {
      multiple,
      extensions: EXT[kind],
    });
    return Promise.all(
      picked.map(async (p) => {
        const mime = mimeFromName(p.name);
        // Only images need a preview URL (thumbnails, QR decoding, avatar crop).
        const url = mime.startsWith("image/") ? ((await resolveMediaSrc(p.path, mime, true)) ?? "") : "";
        return { name: p.name, mime, size: p.size, path: p.path, url };
      }),
    );
  }
  const files = await browserPick(kind, multiple);
  const out: PickedFile[] = [];
  for (const f of files) {
    // Data URLs survive being stored by the mock backend (object URLs would too, but may be revoked).
    out.push({ ...pickedFromFile(f), url: await fileToDataUrl(f) });
  }
  return out;
}

/** A path suitable for commands that take `path` (avatar, contact import). */
export function pickedPath(f: PickedFile): string {
  return f.path ?? f.url;
}

export async function toOutgoingAttachment(
  f: PickedFile,
  kind: OutgoingAttachment["kind"],
  extra: Partial<OutgoingAttachment> = {},
): Promise<OutgoingAttachment> {
  const base: OutgoingAttachment = { file_name: f.name, mime: f.mime, kind, ...extra };
  if (f.path) return { ...base, path: f.path };
  if (f.file) return { ...base, data_base64: await blobToBase64(f.file) };
  // data URL
  const i = f.url.indexOf(",");
  return { ...base, data_base64: f.url.slice(i + 1) };
}

/** Asks where to save a file. Returns a destination path, or null if cancelled. */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (IS_TAURI) {
    return (await invoke<string | null>("pick_save_path", { defaultName })) ?? null;
  }
  return `browser-download:${defaultName}`;
}

/** Browser fallback download of a URL. */
export function browserDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

let permission: Promise<boolean> | null = null;

/** Desktop app: "granted" / "denied" / "default" from macOS's notification system, or "plugin"
 * where the notification plugin handles them (src-tauri/src/attention.rs). */
async function nativePermission(request: boolean): Promise<string> {
  try {
    return await invoke<string>("notify_permission", { request });
  } catch {
    return "plugin";
  }
}

/** Requests notification permission once per app run. */
export function ensureNotificationPermission(): Promise<boolean> {
  permission ??= (async () => {
    try {
      if (IS_TAURI) {
        const native = await nativePermission(true);
        if (native !== "plugin") return native === "granted";
        if (await isPermissionGranted()) return true;
        return (await requestPermission()) === "granted";
      }
      if (typeof Notification === "undefined") return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  })();
  return permission;
}

export async function showNotification(title: string, body: string) {
  if (!(await ensureNotificationPermission())) return;
  try {
    if (IS_TAURI) {
      if ((await nativePermission(false)) === "plugin") sendNotification({ title, body });
      else await invoke("notify_show", { title, body });
    }
    else new Notification(title, { body, icon: "/icon.svg" });
  } catch {
    /* notifications are best effort */
  }
}

let lastBadge = -1;

/** Unread counter on the app icon: macOS Dock / Linux launcher badge, Windows taskbar overlay. */
export async function setAppBadge(count: number) {
  if (!IS_TAURI || count === lastBadge) return;
  lastBadge = count;
  try {
    await invoke("set_unread_badge", { count: Math.max(0, Math.floor(count)) });
  } catch (e) {
    console.warn("unread badge", e);
  }
}

/**
 * Excludes the window from screenshots and screen recording (macOS and Windows; Linux
 * has no such API). Returns false when it could not be applied.
 */
export async function setWindowContentProtected(on: boolean): Promise<boolean> {
  if (!IS_TAURI) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setContentProtected(on);
    return true;
  } catch {
    return false;
  }
}

/** Current notification permission, without prompting. */
export async function notificationPermission(): Promise<"granted" | "denied" | "default"> {
  try {
    if (IS_TAURI) {
      const native = await nativePermission(false);
      if (native !== "plugin") return native as "granted" | "denied" | "default";
      return (await isPermissionGranted()) ? "granted" : "default";
    }
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
  } catch {
    return "denied";
  }
}

/** Opens a web link in the system browser (http and https only, never files or other schemes). */
export async function openExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (IS_TAURI) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** A human readable name for this device, used at login/registration. */
export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux desktop";
  return "Desktop";
}
