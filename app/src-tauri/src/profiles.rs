//! Local profiles: several accounts on one computer, each with its own data directory.
//!
//! The registry, the data directories and the in-process core swap are shared with the mobile
//! app and live in chat-core (`chat_core::profiles`, which documents the layout); this module
//! only exposes them as Tauri commands. The base directory is `CHATAPP_DATA_DIR`, else the app
//! data directory (lib.rs).

use tauri::State;

pub use chat_core::profiles::{CurrentProfile, IdReq, OpenByNumberReq, OpenReq, ProfileCard, Profiles, VisibleReq};

/// Profiles listed on the start screen.
#[tauri::command]
pub fn profiles_list(profiles: State<'_, Profiles>) -> Vec<ProfileCard> {
    profiles.list()
}

#[tauri::command]
pub async fn profile_open(profiles: State<'_, Profiles>, req: OpenReq) -> Result<(), String> {
    profiles.open(&req.id, &req.password).await
}

#[tauri::command]
pub async fn profile_open_by_number(profiles: State<'_, Profiles>, req: OpenByNumberReq) -> Result<(), String> {
    profiles.open_by_number(&req.number, &req.password).await
}

#[tauri::command]
pub async fn profile_close(profiles: State<'_, Profiles>) -> Result<(), String> {
    profiles.close().await
}

#[tauri::command]
pub async fn profile_forget(profiles: State<'_, Profiles>, req: IdReq) -> Result<(), String> {
    profiles.forget(&req.id).await
}

/// Quick switch to an account opened with its password since the app started.
#[tauri::command]
pub async fn profile_switch(profiles: State<'_, Profiles>, req: IdReq) -> Result<(), String> {
    profiles.switch_to(&req.id).await
}

/// Remote wipe: deletes the saved accounts this device was removed from (chat_core::revocation).
#[tauri::command]
pub async fn profiles_check_revoked(profiles: State<'_, Profiles>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "wiped": profiles.check_revoked().await }))
}

#[tauri::command]
pub fn profile_current(profiles: State<'_, Profiles>) -> CurrentProfile {
    profiles.current_settings()
}

#[tauri::command]
pub async fn profile_set_visible(profiles: State<'_, Profiles>, req: VisibleReq) -> Result<(), String> {
    profiles.set_visible(req.visible).await
}
