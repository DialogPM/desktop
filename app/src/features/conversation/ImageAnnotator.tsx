import { Popover, Portal, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconCheck,
  IconCircle,
  IconCrop,
  IconEyeOff,
  IconLine,
  IconPencil,
  IconRotate,
  IconRotateClockwise,
  IconShieldCheck,
  IconSquare,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmojiPicker } from "../../components/EmojiPicker";
import { Icon } from "../../components/Icon";
import { formatBytes } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { pickedFromFile, type PickedFile } from "../../lib/platform";
import {
  ASPECTS,
  aspectRect,
  COLORS,
  cropToSource,
  dragCrop,
  drawRotated,
  drawShapes,
  exportAnnotated,
  fontCss,
  fontFor,
  isMeaningful,
  measureText,
  outputSize,
  outputType,
  rotateShape,
  SIZES,
  strokeFor,
  stripMetadata,
  textHit,
  translateShape,
  type CropHandle,
  type Rect,
  type Rotation,
  type Shape,
  type Tool,
} from "./annotate";

const TOOLS: { key: Tool; icon: ReactNode }[] = [
  { key: "pen", icon: <IconPencil size={19} /> },
  { key: "line", icon: <IconLine size={19} /> },
  { key: "arrow", icon: <IconArrowUpRight size={19} /> },
  { key: "rect", icon: <IconSquare size={19} /> },
  { key: "ellipse", icon: <IconCircle size={19} /> },
  { key: "text", icon: <IconTypography size={19} /> },
  { key: "blur", icon: <IconEyeOff size={19} /> },
];

// Above the preview (z-index 400).
const TIP_Z = 450;
// Room around the image inside the stage.
const STAGE_PAD = 16;

/** One undo step: the shapes, and the crop and rotation they belong to. */
interface EditState {
  shapes: Shape[];
  rot: Rotation;
  /** Region of the original (unrotated) image that is kept; null = all of it. */
  crop: Rect | null;
}

/** Sending straight from the editor (an image opened from a conversation). */
export interface AnnotatorSend {
  /** Name of the conversation the image goes to. */
  recipient: string;
  /** Sends the edited image; false keeps the editor open (the error was already shown). */
  onSend: (edited: PickedFile, caption: string) => Promise<boolean>;
}

const CROP_HANDLES: CropHandle[] = ["nw", "ne", "sw", "se"];

/** "PNG", "JPEG", "SVG"… from a MIME type. */
const typeLabel = (mime: string) => (mime.split("/")[1] ?? "").split("+")[0].replace(/^jpg$/, "jpeg").toUpperCase();

interface TextEdit {
  id: number;
  x: number;
  y: number;
  value: string;
  color: string;
  size: number;
}

/**
 * Full-size editor of an image: drawing tools, text, crop, rotation and metadata cleaning.
 * Shapes, crop and rotation are kept as state (undo / redo walk a history of them) and only
 * baked into a new image, at the original's resolution, on Save / Send. Closing changes nothing.
 *
 * Two uses: an image about to be sent (`onSave` hands the edited file back to the caller), and
 * an image of a conversation (`send`: a caption field and a send button replace Save).
 */
export function ImageAnnotator({
  file,
  onClose,
  onSave,
  send,
}: {
  file: PickedFile;
  onClose: () => void;
  onSave?: (edited: PickedFile) => void;
  send?: AnnotatorSend;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // Re-encoded copy of the image made by "Remove metadata" (replaces the source from then on).
  const [cleaned, setCleaned] = useState<{ blob: Blob; url: string } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [sizeKey, setSizeKey] = useState<(typeof SIZES)[number]["key"]>("medium");
  const factor = SIZES.find((s) => s.key === sizeKey)?.factor ?? 1;
  const [history, setHistory] = useState<{ states: EditState[]; index: number }>({ states: [{ shapes: [], rot: 0, crop: null }], index: 0 });
  const { shapes, rot, crop } = history.states[history.index];
  // Crop mode: the frame being adjusted, in pixels of the image as shown.
  const [cropFrame, setCropFrame] = useState<Rect | null>(null);
  const [aspectKey, setAspectKey] = useState<(typeof ASPECTS)[number]["key"]>("free");
  const aspect = ASPECTS.find((a) => a.key === aspectKey)?.value ?? null;
  const cropDrag = useRef<{ handle: CropHandle; start: Rect; x: number; y: number } | null>(null);
  // A text being dragged to a new place (index into `shapes`).
  const [moving, setMovingState] = useState<{ index: number; shape: Shape } | null>(null);
  const movingRef = useRef<{ index: number; shape: Shape; orig: Shape; x: number; y: number; moved: boolean } | null>(null);
  const [caption, setCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const captionRef = useRef<HTMLInputElement>(null);
  const [draft, setDraftState] = useState<Shape | null>(null);
  // Pointer events can arrive faster than renders: the handlers work on the ref.
  const draftRef = useRef<Shape | null>(null);
  const [text, setTextState] = useState<TextEdit | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The text being typed lives in a ref too: blur / click handlers must see the latest one.
  const textRef = useRef<TextEdit | null>(null);
  const textSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    const i = new window.Image();
    // Keeps the canvas exportable for non-local URLs (blob: and data: never taint it).
    if (!/^(blob|data):/.test(file.url)) i.crossOrigin = "anonymous";
    i.onload = () => alive && setImg(i);
    i.onerror = () => alive && setFailed(true);
    i.src = file.url;
    return () => {
      alive = false;
    };
  }, [file.url]);

  useEffect(() => () => {
    if (cleaned) URL.revokeObjectURL(cleaned.url);
  }, [cleaned]);

  // Callback refs: the Portal mounts its children after the first render.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rootRef = useCallback((el: HTMLDivElement | null) => el?.focus(), []);

  const nw = img?.naturalWidth ?? 0;
  const nh = img?.naturalHeight ?? 0;
  // Size of the image as shown (cropped, rotated); shapes live in these coordinates.
  const [ow, oh] = outputSize(nw, nh, rot, crop);
  // Line and text sizes follow the kept part of the image.
  const baseWidth = crop?.w ?? nw;
  // Display scale: fit the stage, never enlarge.
  const fit = ow && oh && box.w > STAGE_PAD * 2 ? Math.min((box.w - STAGE_PAD * 2) / ow, (box.h - STAGE_PAD * 2) / oh, 1) : 0;
  const dw = Math.max(1, Math.round(ow * fit));
  const dh = Math.max(1, Math.round(oh * fit));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(dw * dpr);
    const ch = Math.round(dh * dpr);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cw, ch);
    drawRotated(ctx, img, rot, cw, ch, crop);
    const shown = moving ? shapes.map((s, i) => (i === moving.index ? moving.shape : s)) : shapes;
    drawShapes(ctx, draft ? [...shown, draft] : shown, cw / ow, ow);
  }, [img, shapes, rot, crop, draft, moving, dw, dh, ow, fit]);

  const pushEdit = (next: (cur: EditState) => EditState) =>
    setHistory((h) => ({ states: [...h.states.slice(0, h.index + 1), next(h.states[h.index])], index: h.index + 1 }));
  const pushState = (next: (cur: Shape[]) => Shape[]) => pushEdit((cur) => ({ ...cur, shapes: next(cur.shapes) }));
  const undo = () => setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) }));
  const redo = () => setHistory((h) => ({ ...h, index: Math.min(h.states.length - 1, h.index + 1) }));
  const clear = () => {
    if (shapes.length) pushState(() => []);
  };
  /** Quarter turn of the image and of everything drawn on it (one undo step). */
  const rotate = (dir: 1 | -1) => {
    if (!img || draftRef.current) return;
    commitText();
    pushEdit((cur) => {
      const [w, h] = outputSize(nw, nh, cur.rot, cur.crop);
      return { ...cur, shapes: cur.shapes.map((s) => rotateShape(s, dir, w, h)), rot: ((cur.rot + dir * 90 + 360) % 360) as Rotation };
    });
    // Crop mode: the frame starts over on the turned image.
    if (cropFrame) setCropFrame(aspectRect(oh, ow, aspect));
  };

  const startCrop = () => {
    if (!img || draftRef.current) return;
    commitText();
    setCropFrame(aspectRect(ow, oh, aspect));
  };
  const pickAspect = (key: (typeof ASPECTS)[number]["key"]) => {
    setAspectKey(key);
    setCropFrame(aspectRect(ow, oh, ASPECTS.find((a) => a.key === key)?.value ?? null));
  };
  /** Keeps only the framed part: one undo step; shapes move along with the image. */
  const applyCrop = () => {
    const f = cropFrame;
    setCropFrame(null);
    if (!f) return;
    // Whole pixels: a quarter turn maps them onto whole pixels of the original.
    const x = Math.max(0, Math.min(ow - 1, Math.round(f.x)));
    const y = Math.max(0, Math.min(oh - 1, Math.round(f.y)));
    const frame: Rect = { x, y, w: Math.max(1, Math.min(ow - x, Math.round(f.w))), h: Math.max(1, Math.min(oh - y, Math.round(f.h))) };
    if (frame.w === ow && frame.h === oh) return;
    pushEdit((cur) => ({
      rot: cur.rot,
      crop: cropToSource(frame, cur.rot, cur.crop ?? { x: 0, y: 0, w: nw, h: nh }),
      shapes: cur.shapes.map((s) => translateShape(s, -frame.x, -frame.y)),
    }));
  };
  /** Starts dragging the frame or one of its corners (`data-handle`). */
  const onCropDown = (e: React.PointerEvent<HTMLElement>) => {
    const handle = (e.currentTarget.dataset.handle ?? "move") as CropHandle;
    if (e.button !== 0 || !cropFrame) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDrag.current = { handle, start: cropFrame, x: e.clientX, y: e.clientY };
  };
  const onCropMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = cropDrag.current;
    if (!d || !fit) return;
    setCropFrame(dragCrop(d.start, d.handle, (e.clientX - d.x) / fit, (e.clientY - d.y) / fit, ow, oh, aspect, Math.min(ow, oh, Math.max(16, 24 / fit))));
  };
  const onCropUp = () => {
    cropDrag.current = null;
  };

  const setMoving = (m: typeof movingRef.current) => {
    movingRef.current = m;
    setMovingState(m ? { index: m.index, shape: m.shape } : null);
  };
  /** Index of the topmost text under a point of the image, or -1. */
  const textAt = (x: number, y: number): number => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return -1;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.kind === "text" && textHit(s, x, y, measureText(ctx, s))) return i;
    }
    return -1;
  };

  const setDraft = (d: Shape | null) => {
    draftRef.current = d;
    setDraftState(d);
  };

  const setText = (v: TextEdit | null) => {
    textRef.current = v;
    setTextState(v);
  };
  const textShape = (te: TextEdit): Shape => ({ kind: "text", color: te.color, size: te.size, x: te.x, y: te.y, text: te.value.trim() });
  /** Turns the text being typed into a shape; `id` limits it to that field (stale blur events). */
  const commitText = (id?: number) => {
    const te = textRef.current;
    if (!te || (id !== undefined && te.id !== id)) return;
    setText(null);
    const s = textShape(te);
    if (isMeaningful(s)) pushState((cur) => [...cur, s]);
  };

  const toImage = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * ow;
    const y = ((e.clientY - r.top) / r.height) * oh;
    return [Math.max(0, Math.min(ow, x)), Math.max(0, Math.min(oh, y))];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !img) return;
    const [x, y] = toImage(e);
    if (tool === "text") {
      commitText();
      // On a text already placed: drag it somewhere else.
      const hit = textAt(x, y);
      if (hit >= 0) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setMoving({ index: hit, shape: shapes[hit], orig: shapes[hit], x, y, moved: false });
        return;
      }
      const size = fontFor(baseWidth, factor);
      setText({ id: ++textSeq.current, x, y: Math.max(0, y - size / 2), value: "", color, size });
      return;
    }
    commitText();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = strokeFor(baseWidth, factor);
    setDraft(tool === "pen" ? { kind: "pen", color, width, points: [[x, y]] } : { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mv = movingRef.current;
    if (mv) {
      const [x, y] = toImage(e);
      setMoving({ ...mv, shape: translateShape(mv.orig, x - mv.x, y - mv.y), moved: mv.moved || Math.hypot(x - mv.x, y - mv.y) > 2 });
      return;
    }
    const d = draftRef.current;
    if (!d || d.kind === "text") return;
    const [x, y] = toImage(e);
    setDraft(d.kind === "pen" ? { ...d, points: [...d.points, [x, y]] } : { ...d, x2: x, y2: y });
  };

  const onPointerUp = () => {
    const mv = movingRef.current;
    if (mv) {
      setMoving(null);
      if (mv.moved) pushState((cur) => cur.map((s, i) => (i === mv.index ? mv.shape : s)));
      return;
    }
    const d = draftRef.current;
    setDraft(null);
    if (d && isMeaningful(d)) pushState((cur) => [...cur, d]);
  };

  const save = async () => {
    if (saving || cropFrame) return;
    const te = textRef.current;
    let all = shapes;
    if (te) {
      commitText();
      const s = textShape(te);
      if (isMeaningful(s)) all = [...shapes, s];
    }
    const changed = all.length > 0 || rot !== 0 || !!crop || !!cleaned;
    // Nothing to save. Sending still goes through an export: the result is a file of its own.
    if (!img || (!changed && !send)) return onClose();
    setSaving(true);
    let edited: PickedFile;
    try {
      const type = outputType(file.mime);
      // Only cleaned: the re-encoded file is already the result.
      const blob = !all.length && !rot && !crop && cleaned ? cleaned.blob : await exportAnnotated(img, all, rot, type, crop);
      edited = pickedFromFile(new File([blob], outputName(type), { type }));
    } catch (err) {
      console.warn("annotation export failed", err);
      notifications.show({ color: "red", message: t("annotate.saveFailed") });
      setSaving(false);
      return;
    }
    if (!send) return onSave?.(edited);
    if (!(await send.onSend(edited, caption.trim()))) {
      URL.revokeObjectURL(edited.url);
      setSaving(false);
    }
  };

  const insertEmoji = (e: string) => {
    const el = captionRef.current;
    const start = el?.selectionStart ?? caption.length;
    const end = el?.selectionEnd ?? caption.length;
    setCaption(caption.slice(0, start) + e + caption.slice(end));
  };

  const outputName = (type: string) => {
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    if (type !== "image/jpeg") return `${base}.png`;
    return /\.jpe?g$/i.test(file.name) ? file.name : `${base}.jpg`;
  };

  /** Replaces the source with a re-encoded copy that carries no metadata. */
  const cleanMetadata = async () => {
    if (!img || cleaning) return;
    if (cleaned) {
      notifications.show({ color: "green", message: t("annotate.metadataRemoved") });
      return;
    }
    setCleaning(true);
    try {
      const blob = await stripMetadata(img, outputType(file.mime));
      const url = URL.createObjectURL(blob);
      const next = new window.Image();
      next.src = url;
      await next.decode();
      setCleaned({ blob, url });
      setImg(next);
      notifications.show({ color: "green", message: t("annotate.metadataRemoved") });
    } catch (err) {
      console.warn("metadata cleaning failed", err);
      notifications.show({ color: "red", message: t("annotate.metadataFailed") });
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (emojiOpen) setEmojiOpen(false);
        else if (textRef.current) setText(null);
        else if (cropFrame) setCropFrame(null);
        else onClose();
        return;
      }
      // The text fields keep their own undo.
      if (e.target instanceof HTMLInputElement) return;
      if (cropFrame) {
        if (e.key === "Enter") {
          e.preventDefault();
          applyCrop();
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "z" || k === "y")) {
        e.preventDefault();
        e.stopPropagation();
        if (k === "y" || e.shiftKey) redo();
        else undo();
      } else if (k === "r" && !mod && !e.altKey && !textRef.current) {
        e.preventDefault();
        e.stopPropagation();
        rotate(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const colorName = (key: string) => t(`annotate.colors.${key}`);

  return (
    <Portal>
      <div ref={rootRef} className="lightbox annot" role="dialog" aria-modal="true" aria-label={t("annotate.title")} tabIndex={-1}>
        <div className="lightbox-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 650, fontSize: 15 }}>{file.name}</div>
            {img && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.62)" }}>
                {[`${ow} × ${oh}`, typeLabel(cleaned?.blob.type ?? file.mime), cleaned ? formatBytes(cleaned.blob.size, locale) : file.size !== null ? formatBytes(file.size, locale) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
          <button type="button" className="lightbox-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div ref={stageRef} className="lightbox-stage" style={{ padding: STAGE_PAD }}>
          {img && fit > 0 && (
            <div className="annot-surface" style={{ width: dw, height: dh }}>
              <canvas
                ref={canvasRef}
                style={{ width: dw, height: dh, cursor: moving ? "grabbing" : tool === "text" ? "text" : "crosshair" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  setDraft(null);
                  setMoving(null);
                }}
                // Keeps the focus in the text field that a click has just placed.
                onMouseDown={(e) => e.preventDefault()}
              />
              {text && (
                <input
                  key={text.id}
                  className="annot-text"
                  autoFocus
                  value={text.value}
                  size={Math.max(6, text.value.length + 1)}
                  placeholder={t("annotate.textPlaceholder")}
                  aria-label={t("annotate.text")}
                  style={{ left: text.x * fit, top: text.y * fit, font: fontCss(text.size * fit), color: text.color }}
                  onChange={(e) => setText({ ...text, value: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      commitText();
                    }
                  }}
                  onBlur={() => commitText(text.id)}
                />
              )}
              {cropFrame && (
                <div className="annot-crop">
                  <div
                    className="annot-crop-frame"
                    style={{ left: cropFrame.x * fit, top: cropFrame.y * fit, width: cropFrame.w * fit, height: cropFrame.h * fit }}
                    onPointerDown={onCropDown}
                    onPointerMove={onCropMove}
                    onPointerUp={onCropUp}
                    onPointerCancel={onCropUp}
                  >
                    {CROP_HANDLES.map((h) => (
                      <span
                        key={h}
                        className="annot-crop-handle"
                        data-handle={h}
                        onPointerDown={onCropDown}
                        onPointerMove={onCropMove}
                        onPointerUp={onCropUp}
                        onPointerCancel={onCropUp}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {failed && <div style={{ color: "rgba(255,255,255,.7)" }}>{t("annotate.loadFailed")}</div>}
        </div>
        <div className="annot-bar">
          {cropFrame ? (
            <>
              <div className="annot-toolbar" role="toolbar" aria-label={t("annotate.crop")}>
                {ASPECTS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className="annot-btn annot-aspect"
                    data-active={aspectKey === a.key}
                    aria-pressed={aspectKey === a.key}
                    onClick={() => pickAspect(a.key)}
                  >
                    {a.key === "free" || a.key === "square" ? t(`annotate.aspect.${a.key}`) : a.key}
                  </button>
                ))}
                <span className="annot-sep" />
                <Tooltip label={t("annotate.rotateLeft")} zIndex={TIP_Z}>
                  <button type="button" className="annot-btn" onClick={() => rotate(-1)} aria-label={t("annotate.rotateLeft")}>
                    <IconRotate size={19} />
                  </button>
                </Tooltip>
                <Tooltip label={t("annotate.rotateRight")} zIndex={TIP_Z}>
                  <button type="button" className="annot-btn" onClick={() => rotate(1)} aria-label={t("annotate.rotateRight")}>
                    <IconRotateClockwise size={19} />
                  </button>
                </Tooltip>
              </div>
              <div className="annot-actions">
                <button type="button" className="annot-action" onClick={() => setCropFrame(null)}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="annot-action" data-primary onClick={applyCrop}>
                  <IconCheck size={17} />
                  {t("annotate.cropApply")}
                </button>
              </div>
            </>
          ) : (
            <>
          <div className="annot-toolbar" role="toolbar" aria-label={t("annotate.title")}>
            {TOOLS.map((tl) => (
              <Tooltip key={tl.key} label={t(`annotate.${tl.key}`)} zIndex={TIP_Z}>
                <button
                  type="button"
                  className="annot-btn"
                  data-active={tool === tl.key}
                  aria-pressed={tool === tl.key}
                  aria-label={t(`annotate.${tl.key}`)}
                  onClick={() => setTool(tl.key)}
                >
                  {tl.icon}
                </button>
              </Tooltip>
            ))}
            <span className="annot-sep" />
            {COLORS.map((c) => (
              <Tooltip key={c.key} label={colorName(c.key)} zIndex={TIP_Z}>
                <button
                  type="button"
                  className="annot-swatch"
                  data-active={color === c.value}
                  aria-pressed={color === c.value}
                  aria-label={t("annotate.color", { name: colorName(c.key) })}
                  style={{ background: c.value }}
                  // A colour picked while typing applies to that text, without leaving the field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setColor(c.value);
                    if (textRef.current) setText({ ...textRef.current, color: c.value });
                  }}
                />
              </Tooltip>
            ))}
            <span className="annot-sep" />
            {SIZES.map((sz, i) => (
              <Tooltip key={sz.key} label={t(`annotate.sizes.${sz.key}`)} zIndex={TIP_Z}>
                <button
                  type="button"
                  className="annot-btn"
                  data-active={sizeKey === sz.key}
                  aria-pressed={sizeKey === sz.key}
                  aria-label={t("annotate.size", { name: t(`annotate.sizes.${sz.key}`) })}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSizeKey(sz.key);
                    if (textRef.current) setText({ ...textRef.current, size: fontFor(baseWidth, sz.factor) });
                  }}
                >
                  <span className="annot-size" style={{ width: 5 + i * 5, height: 5 + i * 5 }} />
                </button>
              </Tooltip>
            ))}
            <span className="annot-sep" />
            <Tooltip label={t("annotate.crop")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={startCrop} disabled={!img} aria-label={t("annotate.crop")}>
                <IconCrop size={19} />
              </button>
            </Tooltip>
            <Tooltip label={t("annotate.rotateLeft")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={() => rotate(-1)} disabled={!img} aria-label={t("annotate.rotateLeft")}>
                <IconRotate size={19} />
              </button>
            </Tooltip>
            <Tooltip label={t("annotate.rotateRight")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={() => rotate(1)} disabled={!img} aria-label={t("annotate.rotateRight")}>
                <IconRotateClockwise size={19} />
              </button>
            </Tooltip>
            <Tooltip label={t("annotate.cleanMetadataHint")} zIndex={TIP_Z} multiline w={260}>
              <button
                type="button"
                className="annot-btn"
                data-active={!!cleaned}
                onClick={() => void cleanMetadata()}
                disabled={!img || cleaning}
                aria-label={t("annotate.cleanMetadata")}
                aria-description={t("annotate.cleanMetadataHint")}
              >
                <IconShieldCheck size={19} />
              </button>
            </Tooltip>
            <span className="annot-sep" />
            <Tooltip label={t("annotate.undo")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={undo} disabled={history.index === 0} aria-label={t("annotate.undo")}>
                <IconArrowBackUp size={19} />
              </button>
            </Tooltip>
            <Tooltip label={t("annotate.redo")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={redo} disabled={history.index >= history.states.length - 1} aria-label={t("annotate.redo")}>
                <IconArrowForwardUp size={19} />
              </button>
            </Tooltip>
            <Tooltip label={t("annotate.clear")} zIndex={TIP_Z}>
              <button type="button" className="annot-btn" onClick={clear} disabled={!shapes.length} aria-label={t("annotate.clear")}>
                <IconTrash size={19} />
              </button>
            </Tooltip>
          </div>
          {send ? (
            <div className="annot-send">
              <span className="annot-recipient truncate" title={send.recipient}>
                {send.recipient}
              </span>
              <div className="annot-caption">
                <input
                  ref={captionRef}
                  value={caption}
                  placeholder={t("composer.caption")}
                  aria-label={t("composer.caption")}
                  maxLength={4000}
                  onChange={(e) => setCaption(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void save();
                    }
                  }}
                />
                <Popover opened={emojiOpen} onChange={setEmojiOpen} position="top-end" withinPortal zIndex={TIP_Z}>
                  <Popover.Target>
                    <button type="button" className="annot-emoji" onClick={() => setEmojiOpen((o) => !o)} aria-label={t("composer.emoji")}>
                      <Icon name="smile" size={20} />
                    </button>
                  </Popover.Target>
                  <Popover.Dropdown p={0}>
                    <EmojiPicker onPick={insertEmoji} />
                  </Popover.Dropdown>
                </Popover>
              </div>
              <Tooltip label={t("composer.sendTo", { name: send.recipient })} zIndex={TIP_Z}>
                <button
                  type="button"
                  className="annot-send-btn"
                  onClick={() => void save()}
                  disabled={saving || !img}
                  aria-label={t("composer.sendTo", { name: send.recipient })}
                >
                  <Icon name="send" size={20} />
                </button>
              </Tooltip>
            </div>
          ) : (
            <div className="annot-actions">
              <button type="button" className="annot-action" onClick={onClose}>
                {t("annotate.close")}
              </button>
              <button type="button" className="annot-action" data-primary onClick={() => void save()} disabled={saving || !img}>
                {t("annotate.save")}
              </button>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
