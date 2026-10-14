# Dialog for desktop

Dialog is an end-to-end encrypted messenger. This repository holds the desktop app
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
