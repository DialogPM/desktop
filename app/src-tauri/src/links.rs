//! Username links: `dialog://u/<name>` (what the web page of https://dialog.pm/@name opens) and
//! the https address itself reach the app here and are handed to the UI
//! (app/src/lib/userLinks.tsx), which parses them and asks the user before doing anything.
//!
//! The scheme is registered by the installers (tauri.conf.json, plugins.deep-link) and, for an
//! AppImage, at start. On Windows and Linux the system starts the app again with the address
//! as an argument: the single-instance plugin passes it to the copy already running.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// The link that started the app, until the UI asks for it; afterwards links are sent as events.
#[derive(Default)]
pub struct Links {
    launch: Mutex<Option<String>>,
    listening: Mutex<bool>,
}

/// Only addresses that can be a username link leave this module (the UI checks them fully).
fn plausible(url: &str) -> bool {
    url.len() <= 200 && (url.starts_with("dialog://u/") || url.starts_with("https://dialog.pm/@"))
}

/// A link the system asked the app to open.
pub fn deliver(app: &AppHandle, url: &str) {
    if !plausible(url) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let Some(links) = app.try_state::<Links>() else { return };
    if *links.listening.lock().unwrap_or_else(|e| e.into_inner()) {
        let _ = app.emit("user_link", url);
    } else {
        *links.launch.lock().unwrap_or_else(|e| e.into_inner()) = Some(url.to_string());
    }
}

/// Called by the UI once it listens for `user_link`: the link that arrived before that, if any.
#[tauri::command]
pub fn take_launch_link(links: tauri::State<'_, Links>) -> Option<String> {
    *links.listening.lock().unwrap_or_else(|e| e.into_inner()) = true;
    links.launch.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[cfg(test)]
mod tests {
    use super::plausible;

    #[test]
    fn only_username_links_are_passed_on() {
        assert!(plausible("dialog://u/maria"));
        assert!(plausible("https://dialog.pm/@maria"));
        for other in ["dialog://x/maria", "https://dialog.pm/", "https://evil.example/@maria", "file:///etc/passwd", "--flag", ""] {
            assert!(!plausible(other), "{other}");
        }
        assert!(!plausible(&format!("dialog://u/{}", "a".repeat(300))));
    }
}
