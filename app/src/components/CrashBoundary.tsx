// Last-resort error boundary around the whole app: an error while rendering would otherwise
// unmount everything and leave an empty (black) window with no way back.

import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";
import { reportError } from "../lib/sentry";

export class CrashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("render crash", error, info.componentStack);
    reportError(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="crash-screen" role="alert">
        <h2>{t("crash.title")}</h2>
        <p>{t("crash.body")}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t("crash.reload")}
        </button>
      </div>
    );
  }
}
