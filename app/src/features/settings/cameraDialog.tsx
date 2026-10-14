import { modals } from "@mantine/modals";
import i18n from "../../i18n";
import { CameraCapture } from "./CameraCapture";

/**
 * Opens the camera dialog; `onUse` saves the photo and returns true on success.
 * `onPickFile` is offered as a fallback when the camera cannot be used.
 */
export function openCameraCapture(onUse: (dataUrl: string) => Promise<boolean>, onPickFile?: () => void) {
  modals.open({
    title: i18n.t("profile.takePhoto"),
    children: <CameraCapture onUse={onUse} onPickFile={onPickFile} />,
    size: 440,
  });
}
