// Tauri IPC shim for tests in a normal browser: maps invoke / events of @tauri-apps/api onto a
// running web bridge (crates/chat-core/examples/web_bridge.rs). Injected before the app loads
// (Playwright addInitScript) with window.__BRIDGE_URL__ set. Development and tests only.
(() => {
  const BRIDGE = window.__BRIDGE_URL__;
  if (!BRIDGE) return;
  const callbacks = new Map();
  const listeners = new Map();
  let nextId = 1;

  function transformCallback(cb, once) {
    const id = nextId++;
    callbacks.set(id, (arg) => {
      if (once) callbacks.delete(id);
      if (cb) cb(arg);
    });
    return id;
  }

  async function invoke(cmd, args) {
    if (cmd === "plugin:event|listen") {
      const eventId = nextId++;
      listeners.set(eventId, { event: args.event, handler: args.handler });
      return eventId;
    }
    if (cmd === "plugin:event|unlisten") {
      listeners.delete(args.eventId);
      return null;
    }
    // Native plugins (dialogs, notifications, window badge, zoom...) are no-ops here.
    if (cmd.startsWith("plugin:")) return null;
    const res = await fetch(`${BRIDGE}/invoke/${cmd}`, { method: "POST", body: JSON.stringify(args ?? {}) });
    if (cmd === "read_media") {
      if (!res.ok) throw await res.text();
      return await res.arrayBuffer();
    }
    const text = await res.text();
    if (!res.ok) throw text;
    return text ? JSON.parse(text) : null;
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (path, protocol = "asset") => `${protocol}://localhost/${encodeURIComponent(path)}`,
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };

  const source = new EventSource(`${BRIDGE}/events`);
  source.onmessage = (m) => {
    const { event, payload } = JSON.parse(m.data);
    for (const [id, l] of listeners) {
      if (l.event !== event) continue;
      const cb = callbacks.get(l.handler);
      if (cb) cb({ event, id, payload });
    }
  };

  // Test hooks: remember peer connections (stats) and optionally force TURN relay.
  const Native = window.RTCPeerConnection;
  if (Native) {
    window.__pcs = [];
    window.RTCPeerConnection = function (config = {}) {
      const pc = new Native(window.__FORCE_RELAY__ ? { ...config, iceTransportPolicy: "relay" } : config);
      window.__pcs.push(pc);
      return pc;
    };
    window.RTCPeerConnection.prototype = Native.prototype;
  }
})();
