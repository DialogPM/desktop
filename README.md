# Dialog for desktop

**An end-to-end encrypted messenger that needs no phone number or email.** · [dialog.pm](https://dialog.pm)

![Dialog: talk freely, no phone number](https://dialog.pm/img/og-en.png)

- **Anonymous account:** the server gives you a random 16-digit number; you choose a password and get a 24-word recovery phrase. A phone number is optional, only so contacts can find you.
- **Signal Protocol** through [libsignal](https://github.com/signalapp/libsignal), with post-quantum key exchange (PQXDH, Kyber), sealed sender and a public key transparency log.
- **Messages, voice and video calls, files**, 1:1 and in groups; disappearing messages, view-once photos and voice messages, voice effects including an anonymized voice.
- **Up to 6 devices** per account, several accounts on one device; local data encrypted with your password, not the OS key store.
- **Open source (AGPL-3.0)**, server in Germany (EU), and you can [run your own server](https://github.com/DialogPM/backend).

**Download:** [Google Play](https://play.google.com/store/apps/details?id=pm.dialog.chat) · [Microsoft Store](https://apps.microsoft.com/detail/9n1lbc3rsjhj) · [Windows, macOS, Linux](https://github.com/DialogPM/desktop/releases/latest) · [Android APK](https://github.com/DialogPM/dialog.app/releases/latest) · iPhone coming soon

## This repository

This repository holds the desktop app
(Windows, macOS, Linux) and the Rust core it is built on:

- `app/` — the desktop app: [Tauri 2](https://tauri.app) shell (`app/src-tauri`) and React UI (`app/src`)
- `crates/chat-core` — the client core: Signal protocol sessions (libsignal), sealed sender,
  private groups (zkgroup), key transparency, the encrypted local database (SQLCipher)
- `crates/voice-fx` — on-device voice effects and noise suppression (also built to WebAssembly)
- `docs/` — architecture, server API and protocol notes

Messages are encrypted on your device; the server only relays ciphertext.

## Build

Requirements: Rust (stable) with the `wasm32-unknown-unknown` target, Node.js 20+ and pnpm 10,
plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
rustup target add wasm32-unknown-unknown
cd app
pnpm install
pnpm tauri build
```

`pnpm dev` runs the UI in a browser with a mock backend; `pnpm tauri dev` runs the full app.

The app connects to `https://chat.dialog.pm` by default. To build it for another server, set
`CHATAPP_DEFAULT_SERVER` at build time:

```bash
CHATAPP_DEFAULT_SERVER=https://chat.example.org pnpm tauri build
```

## License

[GNU Affero General Public License v3.0](LICENSE).
