// Single entry point used by the whole app to talk to the core.
// Picks the real Tauri backend or the in-memory mock (lazy-loaded, so it is not
// part of the main bundle when running inside Tauri).

import { backend, on, type EventPayloads } from "./backend";

export type Backend = typeof backend;
export type EventName = keyof EventPayloads;
export type Unlisten = () => void;

export const IS_TAURI =
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

/** Mock mode: forced with VITE_MOCK=1, or automatically in a plain browser. */
export const USE_MOCK = import.meta.env.VITE_MOCK === "1" || !IS_TAURI;

type MockModule = typeof import("./mock");
let mockModule: Promise<MockModule> | null = null;
const loadMock = (): Promise<MockModule> => (mockModule ??= import("./mock"));

function lazyMockBackend(): Backend {
  return new Proxy({} as Backend, {
    get(_target, prop: string) {
      return (...args: unknown[]) =>
        loadMock().then((m) => {
          const fn = (m.mockBackend as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
          if (!fn) return Promise.reject(`internal: mock command ${prop} not implemented`);
          return fn(...args);
        });
    },
  });
}

export const api: Backend = USE_MOCK ? lazyMockBackend() : backend;

export function onEvent<K extends EventName>(
  event: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<Unlisten> {
  if (USE_MOCK) return loadMock().then((m) => m.mockOn(event, handler));
  return on(event, handler);
}

export { parseError, EVENTS } from "./backend";
export type { EventPayloads } from "./backend";
