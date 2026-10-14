// Turning picked / pasted files into outgoing attachments (shared by the composer and SendMediaModal).

import { notifications } from "@mantine/notifications";
import type { TFunction } from "i18next";
import { formatBytes } from "../../lib/format";
import { toOutgoingAttachment, type PickedFile } from "../../lib/platform";
import type { OutgoingAttachment } from "../../lib/types";
import { getApp } from "../../store/app";

export function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export const isImageFile = (f: PickedFile) => f.mime.startsWith("image/");
export const isVideoFile = (f: PickedFile) => f.mime.startsWith("video/");

export async function imageAttachment(f: PickedFile): Promise<OutgoingAttachment> {
  return toOutgoingAttachment(f, "image", (await imageSize(f.url)) ?? {});
}

/** Shows a notice and returns true when a file is over the server's attachment limit. */
export function rejectTooBig(files: PickedFile[], t: TFunction, locale: string): boolean {
  const max = getApp().serverInfo?.max_attachment_bytes ?? Infinity;
  const tooBig = files.find((f) => f.size !== null && f.size > max);
  if (!tooBig) return false;
  notifications.show({ color: "red", message: t("composer.tooBig", { name: tooBig.name, max: formatBytes(max, locale) }) });
  return true;
}

/** Frees the object URL of a file this app created (paste, drop, annotation export). */
export function releasePicked(f: PickedFile) {
  if (f.file && f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
}
