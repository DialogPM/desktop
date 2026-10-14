# Browser end-to-end tests (real core, real server)

The desktop app's Linux webview (WebKitGTK) has no WebRTC, so voice calls are tested in
Chromium instead: `web_bridge` serves a real chat core over HTTP and `tauri-shim.js` maps the
UI's Tauri IPC onto it. Each bridge is one account with its own data directory.

```bash
# server stack running (scripts/dev-server.sh), optionally coturn + CHATAPP_TURN_* for --relay
cargo build -p chat-core --example web_bridge
target/debug/examples/web_bridge 7001 <data dir of account A> &
target/debug/examples/web_bridge 7002 <data dir of account B> &
(cd app && npx vite --port 1420) &
npm i playwright-core   # anywhere on NODE_PATH
node app/e2e/calls.test.mjs http://localhost:1420 http://127.0.0.1:7001 http://127.0.0.1:7002 "<B's name as A sees it>" [--relay]
```

The data directories need a `db.key` (hex) file, like the desktop app's key-file fallback
(accounts can be created with the demo peer: `DEMO_DATA_DIR=<dir> cargo run -p chat-core
--example demo_peer -- <server> <number>`). `--relay` forces TURN relay candidates.
