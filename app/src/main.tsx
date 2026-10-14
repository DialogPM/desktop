import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/figtree";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./lib/sentry";
import "./lib/consoleBridge";
import "./lib/appearance";
import "./lib/screenProtection";
import "./styles/index.css";
import "./i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CrashBoundary } from "./components/CrashBoundary";
import { Root } from "./Root";

// Drops are accepted only by explicit drop zones (attachments, QR image) and, for text, by
// text fields: anything else dropped on the window (a file, a link) would make the webview
// navigate to it.
function dropAllowed(e: DragEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(".mantine-Dropzone-root, [data-dropzone]")) return true;
  const files = e.dataTransfer?.types.includes("Files") ?? false;
  return !files && !!target?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])");
}
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => {
    if (dropAllowed(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashBoundary>
      <Root />
    </CrashBoundary>
  </StrictMode>,
);
