// "Take a photo" for the profile picture: webcam preview (getUserMedia), capture,
// retake / use, with a square crop preview. The result is a 640x640 JPEG data URL.

import { Loader } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";

const SIZE = 640;

type Phase = "starting" | "live" | "captured" | "error";

export function CameraCapture({ onUse, onPickFile }: { onUse: (dataUrl: string) => Promise<boolean>; onPickFile?: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPhase("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("profile.cameraUnsupported"));
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      stop();
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setPhase("live");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      // Same cases as the QR scanner: permission refused vs. no camera vs. anything else.
      if (name === "NotAllowedError" || name === "SecurityError") setError(t("profile.cameraDenied"));
      else if (name === "NotFoundError" || name === "OverconstrainedError") setError(t("profile.noCamera"));
      else setError(t("profile.cameraError"));
      setPhase("error");
    }
  }, [stop, t]);

  useEffect(() => {
    // Deferred so the camera is not opened twice by StrictMode's mount/unmount/mount.
    const id = window.setTimeout(() => void start(), 0);
    return () => {
      window.clearTimeout(id);
      stop();
    };
  }, [start, stop]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The preview is mirrored (like a mirror / other video apps); keep the photo the same way.
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, side, side, 0, 0, SIZE, SIZE);
    setShot(canvas.toDataURL("image/jpeg", 0.9));
    setPhase("captured");
  };

  const use = async () => {
    if (!shot) return;
    setBusy(true);
    const ok = await onUse(shot);
    setBusy(false);
    if (ok) {
      stop();
      modals.closeAll();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cam-frame" data-phase={phase}>
        <video ref={videoRef} muted playsInline aria-hidden={phase !== "live"} style={{ visibility: phase === "live" ? "visible" : "hidden" }} />
        {phase === "captured" && shot && <img src={shot} alt={t("profile.photoPreview")} />}
        {phase === "starting" && (
          <div className="cam-center">
            <Loader size="sm" color="white" />
          </div>
        )}
        {phase === "error" && (
          <div className="cam-center">
            <Icon name="camera" size={34} />
          </div>
        )}
        {(phase === "live" || phase === "captured") && <div className="cam-mask" aria-hidden />}
      </div>
      {phase === "error" && error ? (
        <div className="notice" data-tone="warn">
          <span>
            <Icon name="alert" size={16} />
          </span>
          <span>{error}</span>
        </div>
      ) : (
        <div className="hint" style={{ textAlign: "center", fontSize: 13 }}>
          {phase === "captured" ? t("profile.cameraReview") : t("profile.cameraHint")}
        </div>
      )}
      <div className="dialog-actions">
        {phase === "captured" ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPhase("live")} disabled={busy}>
              <Icon name="camera" size={17} />
              {t("profile.retake")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void use()} disabled={busy}>
              <Icon name="check" size={17} />
              {t("profile.usePhoto")}
            </button>
          </>
        ) : phase === "error" ? (
          <>
            {onPickFile ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  modals.closeAll();
                  onPickFile();
                }}
              >
                <Icon name="image" size={17} />
                {t("profile.choosePhoto")}
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
                {t("common.close")}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void start()}>
              {t("profile.cameraRetry")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => modals.closeAll()}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-primary" onClick={capture} disabled={phase !== "live"}>
              <Icon name="camera" size={17} />
              {t("profile.capture")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
