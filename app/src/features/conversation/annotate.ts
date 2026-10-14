// Vector annotations drawn over an image (ImageAnnotator.tsx). Coordinates are in pixels of the image
// as currently oriented (after rotation); rendering takes a scale so the same list draws the
// on-screen preview and the full-size export.

export type Tool = "pen" | "line" | "arrow" | "rect" | "ellipse" | "text" | "blur";

/** Shapes defined by a drag from (x1, y1) to (x2, y2). */
type BoxShape = { kind: "line" | "arrow" | "rect" | "ellipse" | "blur"; color: string; width: number; x1: number; y1: number; x2: number; y2: number };

export type Shape =
  | { kind: "pen"; color: string; width: number; points: [number, number][] }
  | BoxShape
  | { kind: "text"; color: string; size: number; x: number; y: number; text: string; /** Degrees, follows image rotations. */ angle?: number };

/** Clockwise rotation of the image, in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

export const COLORS = [
  { key: "red", value: "#ef4444" },
  { key: "blue", value: "#3b82f6" },
  { key: "green", value: "#22c55e" },
  { key: "black", value: "#111111" },
  { key: "white", value: "#ffffff" },
] as const;

/** Stroke width in image pixels: 0.5% of the width, so it looks alike on small and large images. */
export const strokeFor = (imageWidth: number) => Math.max(2, Math.round(imageWidth * 0.005));
/** Text size in image pixels. */
export const fontFor = (imageWidth: number) => Math.max(18, Math.round(imageWidth * 0.022));
/** CSS font of the text tool (canvas and the on-screen text field). */
export const fontCss = (size: number) => `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

/** Draws `shapes` on `ctx`, whose canvas already holds the image drawn at `scale` (canvas px per image px). */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], scale: number, imageWidth: number) {
  for (const s of shapes) {
    if (s.kind === "blur") {
      pixelate(ctx, s, scale, imageWidth);
      continue;
    }
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    switch (s.kind) {
      case "pen": {
        ctx.lineWidth = s.width;
        if (s.points.length === 1) {
          const [x, y] = s.points[0];
          ctx.beginPath();
          ctx.arc(x, y, s.width / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        break;
      }
      case "line":
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        break;
      case "arrow": {
        // Line + filled triangular head; the line stops at the head's base so the tip stays sharp.
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        if (!len) break;
        const head = Math.min(len, s.width * 4 + 8);
        const ux = (s.x2 - s.x1) / len;
        const uy = (s.y2 - s.y1) / len;
        const bx = s.x2 - ux * head;
        const by = s.y2 - uy * head;
        const half = head * 0.6;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(bx - uy * half, by + ux * half);
        ctx.lineTo(bx + uy * half, by - ux * half);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "rect":
        ctx.lineWidth = s.width;
        ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
        break;
      case "ellipse":
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "text":
        // A thin outline keeps the text readable on any background.
        ctx.font = fontCss(s.size);
        ctx.textBaseline = "top";
        ctx.lineWidth = Math.max(2, s.size / 8);
        ctx.strokeStyle = s.color === "#111111" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
        ctx.translate(s.x, s.y);
        if (s.angle) ctx.rotate((s.angle * Math.PI) / 180);
        ctx.strokeText(s.text, 0, 0);
        ctx.fillText(s.text, 0, 0);
        break;
    }
    ctx.restore();
  }
}

/** Hides a region by pixelating what is already drawn there (image and earlier shapes). */
function pixelate(ctx: CanvasRenderingContext2D, s: BoxShape, scale: number, imageWidth: number) {
  const x = Math.round(Math.min(s.x1, s.x2) * scale);
  const y = Math.round(Math.min(s.y1, s.y2) * scale);
  const w = Math.round(Math.abs(s.x2 - s.x1) * scale);
  const h = Math.round(Math.abs(s.y2 - s.y1) * scale);
  if (w < 1 || h < 1) return;
  const block = Math.max(3, Math.round(Math.max(10, imageWidth / 60) * scale));
  const sw = Math.max(1, Math.ceil(w / block));
  const sh = Math.max(1, Math.ceil(h / block));
  // Halve step by step so every block is the average of its pixels (one big downscale only
  // samples a few of them and leaves the shape of the text visible).
  let src: CanvasImageSource = ctx.canvas;
  let sx = x;
  let sy = y;
  let cw = w;
  let ch = h;
  do {
    const nw = Math.max(sw, Math.ceil(cw / 2));
    const nh = Math.max(sh, Math.ceil(ch / 2));
    const next = document.createElement("canvas");
    next.width = nw;
    next.height = nh;
    const t = next.getContext("2d");
    if (!t) return;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(src, sx, sy, cw, ch, 0, 0, nw, nh);
    src = next;
    sx = sy = 0;
    cw = nw;
    ch = nh;
  } while (cw > sw || ch > sh);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, sw, sh, x, y, w, h);
  ctx.restore();
}

/** True when a just-drawn shape is big enough to keep (ignores accidental clicks). */
export function isMeaningful(s: Shape): boolean {
  if (s.kind === "pen") return s.points.length > 0;
  if (s.kind === "text") return !!s.text.trim();
  const dx = Math.abs(s.x2 - s.x1);
  const dy = Math.abs(s.y2 - s.y1);
  return s.kind === "rect" || s.kind === "ellipse" || s.kind === "blur" ? dx > 2 && dy > 2 : Math.hypot(dx, dy) > 3;
}

/** Size of the image once rotated. */
export const rotatedSize = (w: number, h: number, rot: Rotation): [number, number] => (rot % 180 ? [h, w] : [w, h]);

/**
 * Moves a shape along with a quarter turn of the image: `dir` 1 = clockwise, -1 = counter-clockwise;
 * `w` × `h` is the image size before the turn.
 */
export function rotateShape(s: Shape, dir: 1 | -1, w: number, h: number): Shape {
  const p = (x: number, y: number): [number, number] => (dir === 1 ? [h - y, x] : [y, w - x]);
  switch (s.kind) {
    case "pen":
      return { ...s, points: s.points.map(([x, y]) => p(x, y)) };
    case "text": {
      const [x, y] = p(s.x, s.y);
      return { ...s, x, y, angle: ((s.angle ?? 0) + dir * 90 + 360) % 360 };
    }
    default: {
      const [x1, y1] = p(s.x1, s.y1);
      const [x2, y2] = p(s.x2, s.y2);
      return { ...s, x1, y1, x2, y2 };
    }
  }
}

/** Draws `img` turned by `rot`, filling a `w` × `h` area (the rotated size) at the origin. */
export function drawRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, rot: Rotation, w: number, h: number) {
  const [iw, ih] = rotatedSize(w, h, rot);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}

/** Output type that keeps the source format where possible: JPEG stays JPEG, the rest becomes PNG. */
export const outputType = (mime: string) => (mime === "image/jpeg" || mime === "image/jpg" ? "image/jpeg" : "image/png");

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), type, type === "image/jpeg" ? 0.92 : undefined),
  );
}

/**
 * Bakes the rotation and the shapes into a fresh image at full size (no metadata of the original
 * survives): a canvas of the rotated size, the image drawn under `ctx.rotate`, then the shapes.
 */
export function exportAnnotated(img: HTMLImageElement, shapes: Shape[], rot: Rotation, type: string): Promise<Blob> {
  const [w, h] = rotatedSize(img.naturalWidth, img.naturalHeight, rot);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));
  drawRotated(ctx, img, rot, w, h);
  drawShapes(ctx, shapes, 1, img.naturalWidth);
  return toBlob(canvas, type);
}

/**
 * Re-encodes the image through a canvas: only pixels survive, so EXIF / GPS / XMP / ICC and any
 * other embedded data are gone. (Sent images are stripped by the chat core anyway.)
 */
export function stripMetadata(img: HTMLImageElement, type: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));
  ctx.drawImage(img, 0, 0);
  return toBlob(canvas, type);
}
