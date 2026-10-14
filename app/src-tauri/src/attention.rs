//! Getting the user's attention: system notifications (natively on macOS, src/mac_notify.rs)
//! and incoming calls, which bring the window to the front and bounce the Dock icon / flash
//! the taskbar until answered.

use tauri::{AppHandle, Manager, UserAttentionType};

/// Notification permission: "granted", "denied", "default", or "plugin" where the
/// notification plugin handles notifications (not in a macOS app bundle). `request` asks the
/// user when not decided yet.
#[tauri::command]
pub async fn notify_permission(request: bool) -> String {
    log::info!("notifications: permission check (request={request})");
    #[cfg(target_os = "macos")]
    if crate::mac_notify::available() {
        if request && crate::mac_notify::permission_state().await == "default" {
            crate::mac_notify::request_permission().await;
        }
        return crate::mac_notify::permission_state().await.to_string();
    }
    let _ = request;
    "plugin".to_string()
}

/// Shows a system notification (macOS app bundle; elsewhere the UI uses the plugin).
#[tauri::command]
pub fn notify_show(title: String, body: String) {
    #[cfg(target_os = "macos")]
    crate::mac_notify::show(&title, &body);
    #[cfg(not(target_os = "macos"))]
    let _ = (title, body);
}

/// An incoming call rings (`on`) or stopped ringing: the window comes to the front (also
/// when minimized or hidden) and the Dock icon bounces / the taskbar button flashes until the
/// app is focused.
#[tauri::command]
pub fn call_attention(app: AppHandle, on: bool) {
    let Some(window) = app.get_webview_window("main") else { return };
    if on {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    } else {
        let _ = window.request_user_attention(None);
    }
}
