//! Signed auto-updates (tauri-plugin-updater), **off** unless the build sets both:
//!
//! * `DIALOG_UPDATER_PUBKEY`: the minisign public key printed by `pnpm tauri signer generate`
//!   (base64, as printed; the private key never goes near the build machine's repository);
//! * `DIALOG_UPDATER_ENDPOINT`: the https URL of the update manifest (may contain `{{target}}`,
//!   `{{arch}}` and `{{current_version}}`).
//!
//! The plugin verifies every downloaded update against the built-in public key before
//! installing it; there is no option to skip that check, and plain http endpoints are refused.
//! The web UI cannot call the plugin directly (no `updater:` permission in capabilities): it
//! only gets the `update_available` event and the `update_install` command below.
//! See docs/DESKTOP-UPDATER.md.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// The public key and endpoint, when both are configured (https only).
fn settings() -> Option<(&'static str, &'static str)> {
    let pubkey = option_env!("DIALOG_UPDATER_PUBKEY").map(str::trim).filter(|k| !k.is_empty())?;
    let endpoint = option_env!("DIALOG_UPDATER_ENDPOINT").map(str::trim).filter(|e| e.starts_with("https://"))?;
    Some((pubkey, endpoint))
}

/// Puts the updater configuration (`plugins.updater`) into the app config so the plugin can
/// start. Returns false, changing nothing, when updates are not configured in this build.
pub fn configure(ctx: &mut tauri::Context) -> bool {
    let Some((pubkey, endpoint)) = settings() else {
        return false;
    };
    ctx.config_mut()
        .plugins
        .0
        .insert("updater".into(), serde_json::json!({ "pubkey": pubkey, "endpoints": [endpoint] }));
    true
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    tauri_plugin_updater::Builder::new().build()
}

#[derive(Clone, Serialize)]
struct UpdateAvailable {
    version: String,
    notes: Option<String>,
}

/// Looks for an update once at start and tells the UI (`update_available`).
pub fn spawn_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let update = match app.updater() {
            Ok(u) => u.check().await,
            Err(e) => Err(e),
        };
        match update {
            Ok(Some(u)) => {
                log::info!("update available: {}", u.version);
                let _ = app.emit("update_available", UpdateAvailable { version: u.version.clone(), notes: u.body.clone() });
            }
            Ok(None) => {}
            Err(e) => log::warn!("update check: {e}"),
        }
    });
}

/// Downloads the update, verifies its signature, installs it and restarts. Called by the UI
/// only after the user agreed.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    if settings().is_none() {
        return Err("forbidden: updates are not configured in this build".into());
    }
    let update = app
        .updater()
        .map_err(|e| format!("internal: {e}"))?
        .check()
        .await
        .map_err(|e| format!("network: {e}"))?
        .ok_or_else(|| "not_found: no update available".to_string())?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| format!("internal: {e}"))?;
    app.restart()
}
