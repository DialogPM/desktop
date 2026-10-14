//! Tauri commands: thin forwarders to the shared dispatcher in `chat_core::rpc`.
//! The TypeScript side of this contract is `app/src/lib/backend.ts`.

use serde_json::Value;
use tauri::State;

use crate::profiles::Profiles;

macro_rules! forward {
    ($($name:ident),* $(,)?; extra: [$($extra:path),* $(,)?]) => {
        $(
            #[tauri::command]
            pub async fn $name(profiles: State<'_, Profiles>, picked: State<'_, crate::picked::Picked>, req: Option<Value>) -> Result<Value, String> {
                let mut req = req.unwrap_or(Value::Null);
                // File paths only as tokens from the native dialogs (see picked.rs).
                picked.resolve_request(stringify!($name), &mut req)?;
                // Runs on the active profile's core (profiles.rs).
                profiles.dispatch(stringify!($name), req).await
            }
        )*

        pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
            tauri::generate_handler![$($name,)* $($extra),*]
        }

        /// Names of the forwarded commands (checked against the UI in the tests below).
        #[cfg(test)]
        const FORWARDED: &[&str] = &[$(stringify!($name)),*];
    };
}

forward!(
    get_state,
    check_server,
    register,
    login,
    recover,
    logout,
    get_connection_state,
    confirm_mnemonic_saved,
    link_create,
    link_claim,
    link_wait,
    link_cancel,
    link_offer,
    link_offer_wait,
    link_code,
    link_inspect,
    link_approve,
    verify_password,
    get_account_details,
    change_password,
    reveal_mnemonic,
    delete_account,
    set_privacy,
    get_dnd,
    set_dnd,
    get_call_settings,
    set_call_settings,
    get_media_retention,
    set_media_retention,
    get_default_disappearing,
    set_default_disappearing,
    run_media_check,
    reminder_shown_at,
    mark_reminder_shown,
    set_backup_enabled,
    request_phone_code,
    verify_phone,
    remove_phone,
    set_discoverable,
    list_devices,
    unlink_device,
    rename_device,
    get_profile,
    set_profile,
    list_contacts,
    get_contact,
    add_contact_by_number,
    rename_contact,
    set_blocked,
    import_contacts,
    get_my_contact_link,
    add_contact_from_link,
    get_username_link,
    reset_username_link,
    resolve_username_link,
    get_safety_number,
    set_verified,
    watch_presence,
    list_conversations,
    get_conversation,
    open_direct_conversation,
    accept_conversation,
    set_conversation_settings,
    set_draft,
    delete_conversation,
    clear_conversation,
    get_messages,
    send_message,
    edit_message,
    delete_message,
    react,
    forward_messages,
    mark_read,
    send_typing,
    retry_message,
    get_message_info,
    get_edit_history,
    open_view_once,
    view_once_done,
    download_attachment,
    save_attachment,
    search_messages,
    list_media,
    create_group,
    get_group_info,
    update_group,
    add_group_members,
    remove_group_member,
    set_group_admin,
    leave_group,
    set_push_token,
    set_username,
    find_account,
    add_contact_by_query,
    list_blocked,
    call_signal,
    record_call,
    get_ice_servers,
    group_call_start,
    group_call_join,
    group_call_leave,
    group_call_decline,
    group_call_heartbeat,
    group_call_state,
    group_call_signal,
    totp_setup,
    totp_enable,
    totp_disable,
    delete_conversation_for_everyone,
    wipe_all_conversations,
    get_temporary_mode,
    set_temporary_mode,
    unlock,
    protect_local_data,
    reset_local_data,
    pin_message,
    star_message,
    pinned_messages,
    starred_messages,
    clear_group_for_everyone,
    set_group_invite,
    preview_group_invite,
    join_group_by_link,
    cancel_join_request,
    group_join_requests,
    approve_join_request,
    reject_join_request,
    group_bans,
    unban_group_member,
    device_alerts,
    dismiss_device_alerts,
    login_wait_approval,
    login_cancel_approval,
    list_login_requests,
    answer_login_request,
    set_login_approval,
    report_spam,
    kt_status,
    kt_contact_status,
    kt_check_now,
    kt_dismiss_alerts,
    ; extra: [crate::media::read_media, crate::picked::pick_files, crate::picked::pick_save_path, crate::sounds::play_sound, crate::sounds::stop_sound, crate::badge::set_unread_badge, crate::attention::notify_permission, crate::attention::notify_show, crate::attention::call_attention, crate::updater::update_install, ui_log, voice_mask,
        crate::profiles::profiles_list, crate::profiles::profile_open, crate::profiles::profile_open_by_number, crate::profiles::profile_close,
        crate::profiles::profile_forget, crate::profiles::profile_current, crate::profiles::profile_set_visible, crate::profiles::profiles_check_revoked, crate::profiles::profile_switch]
);

/// Masks the voice in a WAV voice note before it is sent (chat_core::voice_mask).
#[tauri::command]
pub async fn voice_mask(data_base64: String) -> Result<String, String> {
    chat_core::profiles::voice_mask_base64(data_base64).await
}

/// Webview console output (see app/src/lib/consoleBridge.ts).
#[tauri::command]
pub fn ui_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "ui", "{message}"),
        "warn" => log::warn!(target: "ui", "{message}"),
        _ => log::info!(target: "ui", "{message}"),
    }
}

#[cfg(test)]
mod tests {
    /// Every command the UI calls (app/src/lib/backend.ts) must be registered here, otherwise
    /// the app fails at runtime with "Command ... not found".
    #[test]
    fn every_ui_command_is_registered() {
        let ts = include_str!("../../src/lib/backend.ts");
        let native = [
            "read_media",
            "pick_files",
            "pick_save_path",
            "play_sound",
            "stop_sound",
            "set_unread_badge",
            "update_install",
            "ui_log",
            "voice_mask",
            "profiles_list",
            "profile_open",
            "profile_open_by_number",
            "profile_close",
            "profile_forget",
            "profile_current",
            "profile_set_visible",
            "profiles_check_revoked",
            "profile_switch",
        ];
        let mut missing = Vec::new();
        // Matches `call("name"` and `call<T>("name"`.
        for (pos, _) in ts.match_indices("(\"") {
            let before = &ts[..pos];
            let line = &before[before.rfind('\n').map_or(0, |i| i + 1)..];
            let is_call = line.ends_with("call") || (line.ends_with('>') && line.contains("call<"));
            if !is_call {
                continue;
            }
            let name: String = ts[pos + 2..].chars().take_while(|c| c.is_ascii_lowercase() || *c == '_').collect();
            if !name.is_empty() && !super::FORWARDED.contains(&name.as_str()) && !native.contains(&name.as_str()) {
                missing.push(name);
            }
        }
        missing.sort();
        missing.dedup();
        assert!(missing.is_empty(), "UI commands not registered in commands.rs: {missing:?}");
    }
}
