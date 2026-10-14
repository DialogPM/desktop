// Error reporting (Sentry) for release builds. Only errors and their stack traces are sent:
// no breadcrumbs (console output and UI events could contain message text), no IP address,
// no user or device name. Message contents, keys and contacts never reach it.

import * as Sentry from "@sentry/react";

const DSN = "https://4f8a30c181936139f3975d9ffe193254@o667654.ingest.us.sentry.io/4512205459750912";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: DSN,
    release: `dialog-desktop@${__APP_VERSION__}`,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    integrations: (defaults) => defaults.filter((i) => i.name !== "Breadcrumbs"),
    maxBreadcrumbs: 0,
    beforeSend(event) {
      delete event.user;
      delete event.server_name;
      if (event.request) event.request = { url: event.request.url?.split(/[?#]/)[0] };
      return event;
    },
  });
}

export function reportError(error: unknown, componentStack?: string | null) {
  if (!import.meta.env.PROD) return;
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined);
}
