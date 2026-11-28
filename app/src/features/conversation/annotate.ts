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

/** Line thickness (and text size) choices: a factor applied to `strokeFor` / `fontFor`. */
export const SIZES = [
  { key: "thin", factor: 0.5 },
  { key: "medium", factor: 1 },
  { key: "thick", factor: 2.4 },
] as const;

/** Stroke width in image pixels: 0.5% of the width, so it looks alike on small and large images. */
export const strokeFor = (imageWidth: number, factor = 1) => Math.max(2, Math.round(imageWidth * 0.005 * factor));
/** Text size in image pixels. */
export const fontFor = (imageWidth: number, factor = 1) => Math.max(18, Math.round(imageWidth * 0.022 * factor));
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

/** A rectangle in pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Moves a shape by (dx, dy). */
export function translateShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case "pen":
      return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
    case "text":
      return { ...s, x: s.x + dx, y: s.y + dy };
    default:
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
}

/** True when (px, py) falls on a text shape whose rendered width is `textWidth` (image pixels). */
export function textHit(s: Extract<Shape, { kind: "text" }>, px: number, py: number, textWidth: number): boolean {
  // Into the text's own frame: origin at its top-left corner, x along the baseline.
  const a = (-(s.angle ?? 0) * Math.PI) / 180;
  const dx = px - s.x;
  const dy = py - s.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const pad = s.size * 0.25;
  return lx >= -pad && lx <= textWidth + pad && ly >= -pad && ly <= s.size + pad;
}

/** Rendered width of a text shape, in image pixels. */
export function measureText(ctx: CanvasRenderingContext2D, s: Extract<Shape, { kind: "text" }>): number {
  ctx.save();
  ctx.font = fontCss(s.size);
  const w = ctx.measureText(s.text).width;
  ctx.restore();
  return w;
}

// ------------------------------------------------------------------ crop

export type CropHandle = "nw" | "ne" | "sw" | "se" | "move";

/** Crop aspect ratios (width / height); null = free. */
export const ASPECTS = [
  { key: "free", value: null },
  { key: "square", value: 1 },
  { key: "4:3", value: 4 / 3 },
  { key: "3:4", value: 3 / 4 },
  { key: "16:9", value: 16 / 9 },
] as const;

/** The largest centred rectangle of `aspect` inside a `bw` × `bh` area (the whole area when free). */
export function aspectRect(bw: number, bh: number, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, w: bw, h: bh };
  let w = bw;
  let h = w / aspect;
  if (h > bh) {
    h = bh;
    w = h * aspect;
  }
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

/**
 * The crop frame after dragging `handle` by (dx, dy) from `start`, kept inside the `bw` × `bh`
 * image, at least `min` on each side and, with `aspect`, at that width / height ratio.
 */
export function dragCrop(start: Rect, handle: CropHandle, dx: number, dy: number, bw: number, bh: number, aspect: number | null, min = 16): Rect {
  if (handle === "move") {
    return { ...start, x: Math.max(0, Math.min(bw - start.w, start.x + dx)), y: Math.max(0, Math.min(bh - start.h, start.y + dy)) };
  }
  const left = handle === "nw" || handle === "sw";
  const top = handle === "nw" || handle === "ne";
  // The opposite corner stays put.
  const ax = left ? start.x + start.w : start.x;
  const ay = top ? start.y + start.h : start.y;
  const mx = Math.max(0, Math.min(bw, (left ? start.x : start.x + start.w) + dx));
  const my = Math.max(0, Math.min(bh, (top ? start.y : start.y + start.h) + dy));
  const maxW = left ? ax : bw - ax;
  const maxH = top ? ay : bh - ay;
  let w = Math.min(maxW, Math.max(min, left ? ax - mx : mx - ax));
  let h = Math.min(maxH, Math.max(min, top ? ay - my : my - ay));
  if (aspect) {
    h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
  }
  return { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
}

/**
 * Turns a crop frame drawn on the image as shown (cropped to `crop`, then turned by `rot`) into
 * a crop of the original, unrotated image.
 */
export function cropToSource(frame: Rect, rot: Rotation, crop: Rect): Rect {
  // A point of the shown image back in the (cropped) source.
  const back = (x: number, y: number): [number, number] => {
    switch (rot) {
      case 90:
        return [y, crop.h - x];
      case 180:
        return [crop.w - x, crop.h - y];
      case 270:
        return [crop.w - y, x];
      default:
        return [x, y];
    }
  };
  const [ax, ay] = back(frame.x, frame.y);
  const [bx, by] = back(frame.x + frame.w, frame.y + frame.h);
  // Whole pixels, inside the previous crop.
  const x = Math.max(0, Math.min(crop.w - 1, Math.round(Math.min(ax, bx))));
  const y = Math.max(0, Math.min(crop.h - 1, Math.round(Math.min(ay, by))));
  const w = Math.max(1, Math.min(crop.w - x, Math.round(Math.abs(bx - ax))));
  const h = Math.max(1, Math.min(crop.h - y, Math.round(Math.abs(by - ay))));
  return { x: crop.x + x, y: crop.y + y, w, h };
}

/** Size of the edited image in pixels: the crop (or the whole image), turned by `rot`. */
export function outputSize(naturalWidth: number, naturalHeight: number, rot: Rotation, crop: Rect | null): [number, number] {
  return rotatedSize(crop?.w ?? naturalWidth, crop?.h ?? naturalHeight, rot);
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

/**
 * Draws `img` (only its `crop` region, when given) turned by `rot`, filling a `w` × `h` area
 * (the rotated size) at the origin.
 */
export function drawRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, rot: Rotation, w: number, h: number, crop?: Rect | null) {
  const [iw, ih] = rotatedSize(w, h, rot);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (crop) ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -iw / 2, -ih / 2, iw, ih);
  else ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
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
 * Bakes the crop, the rotation and the shapes into a fresh image at the original's resolution,
 * never the screen's (no metadata of the original survives): a canvas of the output size, the
 * image drawn under `ctx.rotate`, then the shapes.
 */
export function exportAnnotated(img: HTMLImageElement, shapes: Shape[], rot: Rotation, type: string, crop: Rect | null = null): Promise<Blob> {
  const [w, h] = outputSize(img.naturalWidth, img.naturalHeight, rot, crop);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));
  drawRotated(ctx, img, rot, w, h, crop);
  drawShapes(ctx, shapes, 1, w);
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
