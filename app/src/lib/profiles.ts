// Accounts saved on this computer (profiles): helpers around the switch, which restarts the UI.
// Opening or leaving a profile swaps the core under the UI (app/src-tauri/src/profiles.rs), so
// the page reloads to start from clean state (stores, calls, cached media) on the new profile.

const OPENED_KEY = "chatapp-profile-opened";

/** Reloads the UI after a profile switch. `opened`: the password was just entered. */
export function reloadAfterProfileSwitch(opened: boolean) {
  try {
    if (opened) sessionStorage.setItem(OPENED_KEY, "1");
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/**
 * True once after a reload that followed opening a profile with its password: the app lock
 * must not ask for the password again right away.
 */
export function takeJustOpened(): boolean {
  try {
    const v = sessionStorage.getItem(OPENED_KEY) === "1";
    sessionStorage.removeItem(OPENED_KEY);
    return v;
  } catch {
    return false;
  }
}
