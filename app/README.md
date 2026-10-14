# Dialog: desktop & mobile client

The user interface of Dialog, an end-to-end encrypted messenger. It is a
[Tauri 2](https://v2.tauri.app/) app with a React front end. The Rust core
(`src-tauri/` and `../crates/`) handles crypto, storage and networking. This
folder holds the UI, which talks to the core only through
`src/lib/backend.ts`.

- **Stack:** React 19, TypeScript (strict), Vite, Mantine 9 (core, hooks, modals, notifications, dropzone), Zustand, i18next, react-virtuoso, react-leaflet, jsQR, qrcode.react, @tabler/icons-react (only for glyphs the design icon set lacks). Fonts are bundled with Fontsource (Plus Jakarta Sans, Figtree, JetBrains Mono) because the CSP only allows local fonts.
- **Languages:** English, Română, Italiano. The default is the system language when it is one of these, otherwise English. The choice is saved in `localStorage`.
- **Appearance:** two visual styles from `docs/design/ChatApp-Premium.dc.html` (A "classic warm" and B "floating panels"), each light, dark or automatic. Saved in `localStorage` (`lib/appearance.ts`) and applied as `data-direction` / `data-theme` on `<html>`; the design tokens live in `src/styles/tokens.css`.
- **Layouts:** desktop split view (chat list | conversation | info panel). Below 768 px it switches to a single pane with back navigation, bottom action sheets, long-press menus and safe-area insets.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:1420. In a plain browser the mock backend is used automatically
pnpm dev:mock     # same, but forces the mock (VITE_MOCK=1)
pnpm tauri dev    # the real desktop app (needs the Rust toolchain and src-tauri)
```

To run two accounts side by side on one machine (e.g. to test chats between them):

```bash
scripts/run-two-accounts.sh   # from the repo root: builds once, starts two instances
```

It builds the UI into the binary and starts it twice with `CHATAPP_DATA_DIR=.local/user1`
and `.local/user2`. Do not start a second instance from an older binary while the first one
uses the dev server: the UI would be newer than the native side, and the app then shows
"The app needs to be rebuilt".

Local media (attachments, avatars) is served to the webview by the `chatmedia://` protocol
(images) or read over IPC as blob URLs (audio, video, and everything when the webview cannot
use the protocol). See `src/lib/media.ts`; set `localStorage["chatapp.mediaMode"] = "ipc"` to
force the IPC path while debugging.

Other scripts:

| script | what it does |
| --- | --- |
| `pnpm typecheck` | `tsc -b` |
| `pnpm lint` | ESLint (typescript-eslint + react-hooks + react-refresh) |
| `pnpm build` | `tsc -b && vite build` into `dist/` |
| `pnpm preview` | serves `dist/` |
| `pnpm tauri …` | Tauri CLI |

## Mock mode

`src/lib/mock/` implements the entire backend API and its events in memory,
with realistic sample data: direct chats and groups, every message kind
(text, images, undownloaded images, files, voice notes, locations, system
events, replies, reactions, edits, deletions, forwards, failed messages),
presence, typing, delivery and read receipts, and simulated incoming
messages and replies.

The mock is used when either of these is true:

- `VITE_MOCK=1` (see `.env.example`), even inside Tauri, or
- `window.__TAURI_INTERNALS__` is undefined, i.e. the app runs in a normal browser.

The mock is lazy loaded, so it is not part of the main bundle when the real
core is used.

Useful URL parameters and helpers in mock mode:

- `?mock=fresh` starts at onboarding (clears the mock session).
- `?mock=ready` starts logged in.
- The phone verification code is `123456`. The password `wrong` fails login. Server host names containing `closed` or `private` refuse registration, and names containing `offline` or `down` fail the connection test.
- In the browser console, `__chatappMock.incoming("conv-maria", "Hi!")` simulates an incoming message and `__chatappMock.loggedOut("device_removed")` simulates remote logout.

## Project layout

```
src/
  main.tsx, Root.tsx       entry, Mantine providers, translated built-in labels
  App.tsx                  onboarding vs. main layout, event bridge bootstrap
  theme.ts, styles/        Mantine mapped onto the design tokens; tokens for A/B x light/dark (styles/index.css imports
                           every stylesheet in cascade order; feature styles live next to their components)
  i18n.ts, locales/        en.json, ro.json, it.json (identical key sets)
  lib/
    types.ts, backend.ts   contract with the Rust core (do not change signatures)
    api.ts                 picks the real backend or the mock, event subscription
    platform.ts            wrappers for Tauri plugins with browser fallbacks
                           (file dialogs, save, notifications, opener, convertFileSrc)
    format.ts, messageText.ts, hooks.ts, password.ts
    mock/                  in-memory backend + sample data + generated media
  store/
    app.ts                 Zustand store (normalized conversations/messages/contacts)
    actions.ts             high-level actions and navigation (goBack, selection…)
    events.ts              core events → store, desktop notifications, unread title
    selectors.ts
  components/              avatars, ticks, menus/action sheets, emoji picker, QR code/scanner, …
  features/
    onboarding/            server choice, register + seed + confirmation, login, recover
    layout/                MainLayout (responsive panes, back button / Escape handling)
    chats/                 chat list, search, filters, new chat, new group, QR modal, chat dialogs
    conversation/          header, virtualized message list, bubbles, composer, voice recorder/player,
                           attachments, lightbox, location picker/map, forward/delete/info dialogs
    info/                  contact info, group info, safety number, media gallery
    settings/              profile, account, privacy, devices, chats, appearance, language, about
```

## Notes for the Rust side / integration

- **Components never import `@tauri-apps/*`.** Everything goes through `lib/backend.ts` (commands and events) and `lib/platform.ts` (plugins).
- **Tauri plugins used:** `dialog` (`open` for attachments, avatars and address books; `save` for "Save as…"), `notification`, `opener` (`openUrl` for links and "Open in maps"). Their capabilities must be allowed in `src-tauri/capabilities`.
- **Window/webview permissions:** `core:window:allow-set-badge-count`, `core:window:allow-set-content-protected` ("Block screenshots" in Privacy, macOS/Windows only) and `core:webview:allow-set-webview-zoom` (text size in Appearance; the browser/mock uses CSS `zoom` instead).
- **Local files** (avatars, attachments) are shown with `convertFileSrc`, so the asset protocol must be enabled and scoped to the app data directory.
- **Drag & drop** uses HTML5 drag events (Mantine Dropzone), so the window needs `dragDropEnabled: false` in `tauri.conf.json`. Otherwise Tauri intercepts file drops.
- **Voice notes** are recorded with `MediaRecorder` (`audio/ogg;codecs=opus` when available, otherwise `audio/webm`). **QR scanning** uses `getUserMedia`. On macOS and mobile the usual microphone and camera usage descriptions are needed.
- **Map tiles** come from `tile.openstreetmap.org`. If a CSP is configured, allow it in `img-src`.
- **Message lists:** `getMessages` is called with `limit: 40`, and with `before = oldest sent_at` for upward pagination. `message` events are upserted by id.

## Screenshots

See `../docs/screenshots/redesign/` (desktop 1440×900 and phone 390×844, styles A and B, light and dark, generated from mock mode).
