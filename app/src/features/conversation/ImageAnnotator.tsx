import { Portal, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconCircle,
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
import { Icon } from "../../components/Icon";
import { formatBytes } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { pickedFromFile, type PickedFile } from "../../lib/platform";
import {
  COLORS,
  drawRotated,
  drawShapes,
  exportAnnotated,
  fontCss,
  fontFor,
  isMeaningful,
  outputType,
  rotatedSize,
  rotateShape,
  strokeFor,
  stripMetadata,
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

/** One undo step: the shapes and the rotation they belong to. */
interface EditState {
  shapes: Shape[];
  rot: Rotation;
}

/** "PNG", "JPEG", "SVG"… from a MIME type. */
const typeLabel = (mime: string) => (mime.split("/")[1] ?? "").split("+")[0].replace(/^jpg$/, "jpeg").toUpperCase();

interface TextEdit {
  id: number;
  x: number;
  y: number;
  value: string;
  color: string;
}

/**
 * Full-size preview of an image about to be sent, with drawing tools, rotation and metadata
 * cleaning. Shapes and rotation are kept as state (undo / redo walk a history of them) and only
 * baked into a new image on Save.
 */
export function ImageAnnotator({ file, onClose, onSave }: { file: PickedFile; onClose: () => void; onSave: (edited: PickedFile) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // Re-encoded copy of the image made by "Remove metadata" (replaces the source from then on).
  const [cleaned, setCleaned] = useState<{ blob: Blob; url: string } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [history, setHistory] = useState<{ states: EditState[]; index: number }>({ states: [{ shapes: [], rot: 0 }], index: 0 });
  const { shapes, rot } = history.states[history.index];
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
  // Size of the image as shown (rotated); shapes live in these coordinates.
  const [ow, oh] = rotatedSize(nw, nh, rot);
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
    drawRotated(ctx, img, rot, cw, ch);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, cw / ow, img.naturalWidth);
  }, [img, shapes, rot, draft, dw, dh, ow, fit]);

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
      const [w, h] = rotatedSize(nw, nh, cur.rot);
      return { shapes: cur.shapes.map((s) => rotateShape(s, dir, w, h)), rot: ((cur.rot + dir * 90 + 360) % 360) as Rotation };
    });
  };

  const setDraft = (d: Shape | null) => {
    draftRef.current = d;
    setDraftState(d);
  };

  const setText = (v: TextEdit | null) => {
    textRef.current = v;
    setTextState(v);
  };
  const textShape = (te: TextEdit): Shape => ({ kind: "text", color: te.color, size: fontFor(nw), x: te.x, y: te.y, text: te.value.trim() });
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
      setText({ id: ++textSeq.current, x, y: Math.max(0, y - fontFor(nw) / 2), value: "", color });
      return;
    }
    commitText();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = strokeFor(nw);
    setDraft(tool === "pen" ? { kind: "pen", color, width, points: [[x, y]] } : { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = draftRef.current;
    if (!d || d.kind === "text") return;
    const [x, y] = toImage(e);
    setDraft(d.kind === "pen" ? { ...d, points: [...d.points, [x, y]] } : { ...d, x2: x, y2: y });
  };

  const onPointerUp = () => {
    const d = draftRef.current;
    setDraft(null);
    if (d && isMeaningful(d)) pushState((cur) => [...cur, d]);
  };

  const save = async () => {
    const te = textRef.current;
    let all = shapes;
    if (te) {
      commitText();
      const s = textShape(te);
      if (isMeaningful(s)) all = [...shapes, s];
    }
    if (!img || (!all.length && !rot && !cleaned)) return onClose();
    setSaving(true);
    try {
      const type = outputType(file.mime);
      // Only cleaned: the re-encoded file is already the result.
      const blob = !all.length && !rot && cleaned ? cleaned.blob : await exportAnnotated(img, all, rot, type);
      onSave(pickedFromFile(new File([blob], outputName(type), { type })));
    } catch (err) {
      console.warn("annotation export failed", err);
      notifications.show({ color: "red", message: t("annotate.saveFailed") });
      setSaving(false);
    }
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
        if (textRef.current) setText(null);
        else onClose();
        return;
      }
      // The text field keeps its own undo.
      if (e.target instanceof HTMLInputElement) return;
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
                style={{ width: dw, height: dh, cursor: tool === "text" ? "text" : "crosshair" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDraft(null)}
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
                  style={{ left: text.x * fit, top: text.y * fit, font: fontCss(fontFor(nw) * fit), color: text.color }}
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
            </div>
          )}
          {failed && <div style={{ color: "rgba(255,255,255,.7)" }}>{t("annotate.loadFailed")}</div>}
        </div>
        <div className="annot-bar">
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
          <div className="annot-actions">
            <button type="button" className="annot-action" onClick={onClose}>
              {t("annotate.close")}
            </button>
            <button type="button" className="annot-action" data-primary onClick={() => void save()} disabled={saving || !img}>
              {t("annotate.save")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
