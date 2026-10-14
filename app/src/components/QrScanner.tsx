// Scans a QR code from the webcam (getUserMedia + jsQR), from an image file, or accepts a pasted link.

import { IconClipboard } from "@tabler/icons-react";
import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pickFiles } from "../lib/platform";
import { Icon } from "./Icon";

function decodeImageData(data: ImageData): string | null {
  return jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

async function decodeUrl(url: string): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

interface ScannerProps {
  onResult: (text: string) => void;
  busy?: boolean;
  /** Text under the viewfinder. */
  hint?: string;
  /** Label of the "paste a link" divider, placeholder of the field and its button. */
  pasteLabel?: string;
  placeholder?: string;
  submitLabel?: string;
}

export function QrScanner({ onResult, busy, hint, pasteLabel, placeholder, submitLabel }: ScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCamera(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!camera) return;
    let raf = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      const v = videoRef.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const res = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (res) {
          stop();
          onResult(res);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [camera, onResult, stop]);

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("qr.cameraUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCamera(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      // Permission refused (by the user or the OS privacy settings) vs. no camera at all.
      if (name === "NotAllowedError" || name === "SecurityError") setError(t("qr.cameraDenied"));
      else if (name === "NotFoundError" || name === "OverconstrainedError") setError(t("qr.noCamera"));
      else setError(t("qr.cameraError"));
    }
  };

  const decodeBlob = useCallback(
    async (blob: Blob) => {
      setError(null);
      const url = URL.createObjectURL(blob);
      try {
        const res = await decodeUrl(url);
        if (res) onResult(res);
        else setError(t("qr.notFound"));
      } catch {
        setError(t("qr.notFound"));
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [onResult, t],
  );

  // Pasting a screenshot of a QR code (Cmd/Ctrl+V) or a link works anywhere while the scanner is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const image = items.find((it) => it.kind === "file" && it.type.startsWith("image/"))?.getAsFile();
      if (image) {
        e.preventDefault();
        void decodeBlob(image);
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      const target = e.target as HTMLElement | null;
      if (text.startsWith("chatapp://") && target?.tagName !== "INPUT") {
        e.preventDefault();
        onResult(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [decodeBlob, onResult]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) void decodeBlob(file);
  };

  const fromImage = async () => {
    setError(null);
    const [f] = await pickFiles({ kind: "image" });
    if (!f) return;
    try {
      const res = await decodeUrl(f.url);
      if (res) onResult(res);
      else setError(t("qr.notFound"));
    } catch {
      setError(t("qr.notFound"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "6px 0 2px" }}>
      <div className="qr-scan-frame" data-dropzone onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {camera && <video ref={videoRef} muted playsInline />}
        <div className="qr-corner" data-c="tl" />
        <div className="qr-corner" data-c="tr" />
        <div className="qr-corner" data-c="bl" />
        <div className="qr-corner" data-c="br" />
        <div className="qr-scan-line" />
      </div>
      <div className="hint" style={{ fontSize: 13.5, textAlign: "center", maxWidth: 300, lineHeight: 1.45 }}>
        {hint ?? t("qr.scanHint")}
        <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.8 }}>{t("qr.pasteImageHint")}</div>
      </div>
      {error && (
        <div className="notice" data-tone="warn" style={{ width: "100%" }}>
          <span>
            <Icon name="alert" size={16} />
          </span>
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, width: "100%" }}>
        {camera ? (
          <button type="button" className="btn btn-secondary" data-size="sm" style={{ flex: 1 }} onClick={stop}>
            <Icon name="x" size={16} />
            {t("qr.stopCamera")}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" data-size="sm" style={{ flex: 1 }} onClick={startCamera}>
            <Icon name="camera" size={16} />
            {t("qr.useCamera")}
          </button>
        )}
        <button type="button" className="btn btn-secondary" data-size="sm" style={{ flex: 1 }} onClick={fromImage}>
          <Icon name="image" size={16} />
          {t("qr.fromImage")}
        </button>
      </div>
      <div className="or-divider" style={{ width: "100%" }}>
        {pasteLabel ?? t("qr.orPaste")}
      </div>
      <div style={{ display: "flex", gap: 8, width: "100%" }}>
        <div className="field-input field-affix" data-variant="sunk" style={{ flex: 1, height: 44 }}>
          <IconClipboard size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <input
            placeholder={placeholder ?? "chatapp://add?n=…"}
            value={link}
            onChange={(e) => setLink(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && link.trim() && onResult(link.trim())}
            aria-label={pasteLabel ?? t("qr.orPaste")}
            style={{ fontSize: 13.5 }}
          />
        </div>
        <button type="button" className="btn btn-primary" data-size="sm" onClick={() => link.trim() && onResult(link.trim())} disabled={!link.trim() || busy}>
          {submitLabel ?? t("common.add")}
        </button>
      </div>
    </div>
  );
}
