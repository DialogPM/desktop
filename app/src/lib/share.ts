// "Share" for the contact QR code: the native share sheet when the webview has one,
// otherwise a PNG download (browser) or copying the link (desktop webview without share/download).

import { IS_TAURI } from "./api";
import { browserDownload, copyText } from "./platform";

/** Renders an <svg> (the QR code) to a PNG with a white margin. */
export async function svgToPng(svg: SVGSVGElement, size = 720): Promise<Blob | null> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = new Image();
  img.src = url;
  await img.decode();
  const pad = Math.round(size * 0.08);
  const canvas = document.createElement("canvas");
  canvas.width = size + pad * 2;
  canvas.height = size + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, pad, pad, size, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export type ShareOutcome = "shared" | "downloaded" | "copied" | "cancelled" | "failed";

export async function shareQr(opts: { link: string; title: string; svg: SVGSVGElement | null; fileName: string }): Promise<ShareOutcome> {
  const { link, title, svg, fileName } = opts;
  const png = svg ? await svgToPng(svg).catch(() => null) : null;
  if (typeof navigator.share === "function") {
    try {
      const file = png ? new File([png], fileName, { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title, text: link, files: [file] });
      else await navigator.share({ title, text: link });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  if (png && !IS_TAURI) {
    const url = URL.createObjectURL(png);
    browserDownload(url, fileName);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  }
  // The desktop webview can neither share nor write files from the frontend: copy the link.
  return (await copyText(link)) ? "copied" : "failed";
}
