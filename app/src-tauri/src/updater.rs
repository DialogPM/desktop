//! Signed auto-updates (tauri-plugin-updater), **off** unless the build sets both:
//!
//! * `DIALOG_UPDATER_PUBKEY`: the minisign public key printed by `pnpm tauri signer generate`
//!   (base64, as printed; the private key never goes near the build machine's repository);
//! * `DIALOG_UPDATER_ENDPOINT`: the https URL of the update manifest (may contain `{{target}}`,
//!   `{{arch}}` and `{{current_version}}`).
//!
//! And only in a copy that can replace itself (`self_updating`): never one that came from a
//! store or from a system package.
//!
//! The plugin verifies every downloaded update against the built-in public key before
//! installing it; there is no option to skip that check, and plain http endpoints are refused.
//! The web UI cannot call the plugin directly (no `updater:` permission in capabilities): it
//! only gets the `update_available` and `update_progress` events and the commands below.
//! See docs/DESKTOP-UPDATER.md.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::utils::config::BundleType;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// The app runs for days: it looks again this often after the check at start.
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// The public key and endpoint, when both are configured (https only).
fn settings() -> Option<(&'static str, &'static str)> {
    let pubkey = option_env!("DIALOG_UPDATER_PUBKEY").map(str::trim).filter(|k| !k.is_empty())?;
    let endpoint = option_env!("DIALOG_UPDATER_ENDPOINT").map(str::trim).filter(|e| e.starts_with("https://"))?;
    Some((pubkey, endpoint))
}

/// Only installs that can replace themselves without another package manager: the Windows
/// setup program (NSIS), the AppImage and the macOS app outside the App Store. The same binary
/// also ships as .msi (repackaged for the Microsoft Store), .deb (repackaged as a snap) and
/// .rpm: those are updated by the store or by the system, never by the app.
fn self_updating(bundle: Option<BundleType>, store_receipt: bool) -> bool {
    match bundle {
        Some(BundleType::Nsis | BundleType::AppImage) => true,
        Some(BundleType::App) => !store_receipt,
        _ => false,
    }
}

/// A copy from the Mac App Store carries a receipt in its bundle.
fn store_receipt() -> bool {
    #[cfg(target_os = "macos")]
    {
        // …/Dialog.app/Contents/MacOS/dialog -> …/Dialog.app/Contents/_MASReceipt
        std::env::current_exe()
            .ok()
            .and_then(|exe| Some(exe.parent()?.parent()?.join("_MASReceipt")))
            .is_some_and(|receipt| receipt.exists())
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Whether this copy of the app updates itself.
fn enabled() -> bool {
    settings().is_some() && self_updating(tauri::utils::platform::bundle_type(), store_receipt())
}

/// Puts the updater configuration (`plugins.updater`) into the app config so the plugin can
/// start. Returns false, changing nothing, when this copy does not update itself.
pub fn configure(ctx: &mut tauri::Context) -> bool {
    if !enabled() {
        return false;
    }
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
pub struct UpdateAvailable {
    version: String,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct UpdateStatus {
    /// False: this copy is updated by a store, by the system or by hand.
    enabled: bool,
    available: Option<UpdateAvailable>,
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    /// None when the server did not say how large the update is.
    total: Option<u64>,
}

/// The update found by the last check (the UI may start after it, or be reloaded).
static AVAILABLE: Mutex<Option<UpdateAvailable>> = Mutex::new(None);
/// One installation at a time.
static INSTALLING: AtomicBool = AtomicBool::new(false);

/// Asks the endpoint once; remembers the answer and tells the UI (`update_available`) about a
/// version it has not announced yet.
async fn check(app: &AppHandle) -> Result<Option<UpdateAvailable>, String> {
    let found = app
        .updater()
        .map_err(|e| format!("internal: {e}"))?
        .check()
        .await
        .map_err(|e| format!("network: {e}"))?
        .map(|u| UpdateAvailable { version: u.version.clone(), notes: u.body.clone() });
    let news = {
        let mut known = AVAILABLE.lock().unwrap();
        let news = match (&*known, &found) {
            (Some(old), Some(new)) => old.version != new.version,
            (None, Some(_)) => true,
            _ => false,
        };
        *known = found.clone();
        news
    };
    if let (true, Some(update)) = (news, &found) {
        log::info!("update available: {}", update.version);
        let _ = app.emit("update_available", update.clone());
    }
    Ok(found)
}

/// Looks for an update at start and then every few hours (a thread of its own that sleeps in
/// between: no timer of an async runtime, which not every platform's build has here).
pub fn spawn_check(app: AppHandle) {
    let spawned = std::thread::Builder::new().name("update-check".into()).spawn(move || loop {
        if !INSTALLING.load(Ordering::SeqCst) {
            if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
                log::warn!("update check: {e}");
            }
        }
        std::thread::sleep(CHECK_EVERY);
    });
    if let Err(e) = spawned {
        log::warn!("update check: {e}");
    }
}

/// Whether this copy updates itself, and the update the last check found.
#[tauri::command]
pub fn update_status() -> UpdateStatus {
    UpdateStatus { enabled: enabled(), available: AVAILABLE.lock().unwrap().clone() }
}

/// Looks for an update now (the button in the settings).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateStatus, String> {
    if !enabled() {
        return Ok(update_status());
    }
    let available = check(&app).await?;
    Ok(UpdateStatus { enabled: true, available })
}

/// Downloads the update, verifies its signature, installs it and restarts. Called by the UI
/// only after the user agreed. The UI follows the download through `update_progress`.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    if !enabled() {
        return Err("forbidden: this copy of the app does not update itself".into());
    }
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("conflict: an update is already being installed".into());
    }
    let result = install(&app).await;
    INSTALLING.store(false, Ordering::SeqCst);
    result?;
    app.restart()
}

async fn install(app: &AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| format!("internal: {e}"))?
        .check()
        .await
        .map_err(|e| format!("network: {e}"))?
        .ok_or_else(|| "not_found: no update available".to_string())?;
    let mut downloaded = 0u64;
    let mut reported = 0u64;
    let progress = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                // Not an event per network chunk: one per 256 KiB and one at the end.
                if downloaded - reported >= 256 * 1024 || Some(downloaded) == total {
                    reported = downloaded;
                    let _ = progress.emit("update_progress", UpdateProgress { downloaded, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| format!("internal: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_installs_that_replace_themselves_update() {
        assert!(self_updating(Some(BundleType::Nsis), false));
        assert!(self_updating(Some(BundleType::AppImage), false));
        assert!(self_updating(Some(BundleType::App), false));
        // The Mac App Store, the Microsoft Store (from the .msi), the snap (from the .deb),
        // system packages, and a binary run outside any package.
        assert!(!self_updating(Some(BundleType::App), true));
        assert!(!self_updating(Some(BundleType::Msi), false));
        assert!(!self_updating(Some(BundleType::Deb), false));
        assert!(!self_updating(Some(BundleType::Rpm), false));
        assert!(!self_updating(None, false));
    }
}
