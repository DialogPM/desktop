//! Tauri shell: starts the chat core and exposes it to the web UI as commands and events.

mod attention;
mod badge;
mod idle;
#[cfg(target_os = "macos")]
mod mac_notify;
mod commands;
mod media;
mod picked;
mod profiles;
mod sounds;
mod updater;

use std::path::PathBuf;
use std::sync::Arc;

use chat_core::EventSink;
use tauri::{AppHandle, Emitter, Manager};

/// Built-in default server. Override at build time with `CHATAPP_DEFAULT_SERVER`.
fn default_server_url() -> String {
    match option_env!("CHATAPP_DEFAULT_SERVER") {
        Some(url) if !url.is_empty() => url.to_string(),
        _ if cfg!(debug_assertions) => "http://localhost:8080".to_string(),
        _ => "https://chat.dialog.pm".to_string(),
    }
}

fn platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "desktop"
    }
}

/// Identifiers the app had before (newest first): the data folder named after one of them is
/// moved to the current one on the first start (`migrate_legacy_data_dir`).
const LEGACY_IDENTIFIERS: [&str; 1] = ["com.dialog.app"];
/// Windows: the data lives in `%APPDATA%\.dialog` (a short name next to the other apps' folders)
/// instead of the identifier-named folder Tauri gives by default.
const WINDOWS_DATA_DIR: &str = ".dialog";

/// Base data directory: `CHATAPP_DATA_DIR` if set (e.g. to run two copies side by side during
/// development), otherwise the platform's app data directory (on Windows `%APPDATA%\.dialog`).
/// Each account (profile) has its own directory inside it (profiles.rs).
fn data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    match std::env::var_os("CHATAPP_DATA_DIR").filter(|v| !v.is_empty()) {
        Some(dir) => Ok(PathBuf::from(dir)),
        None => {
            let default = app.path().app_data_dir()?;
            let dir = if cfg!(target_os = "windows") {
                default.parent().map_or(default.clone(), |p| p.join(WINDOWS_DATA_DIR))
            } else {
                default.clone()
            };
            // Earlier folder names, newest first: the identifier-named one (Windows only, where
            // the folder moved) and the ones of the earlier identifiers.
            let mut legacy: Vec<PathBuf> = Vec::new();
            if dir != default {
                legacy.push(default.clone());
            }
            if let Some(parent) = default.parent() {
                legacy.extend(LEGACY_IDENTIFIERS.iter().map(|id| parent.join(id)));
            }
            migrate_legacy_data_dir(&dir, &legacy);
            Ok(dir)
        }
    }
}

/// Moves the data of an earlier folder name into the current directory (once, if the current one
/// does not exist yet), so a rename keeps the accounts on this device.
fn migrate_legacy_data_dir(dir: &std::path::Path, legacy: &[PathBuf]) {
    if dir.exists() {
        return;
    }
    let Some(old) = legacy.iter().find(|p| p.as_path() != dir && p.is_dir()) else { return };
    match std::fs::rename(old, dir) {
        Ok(()) => log::info!("moved app data from {} to {}", old.display(), dir.display()),
        Err(e) => log::warn!("could not move app data from {}: {e}", old.display()),
    }
}

#[cfg(test)]
mod data_dir_tests {
    use super::{migrate_legacy_data_dir, LEGACY_IDENTIFIERS};

    /// macOS: the folder is named after the identifier; the one of the previous identifier
    /// (what users have installed today) is renamed to it.
    #[test]
    fn renames_the_previous_identifiers_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("pm.dialog.chat");
        let previous = tmp.path().join(LEGACY_IDENTIFIERS[0]);
        std::fs::create_dir_all(previous.join("profiles")).unwrap();
        std::fs::write(previous.join("profiles.json"), b"{}").unwrap();
        let legacy: Vec<_> = LEGACY_IDENTIFIERS.iter().map(|id| tmp.path().join(id)).collect();
        migrate_legacy_data_dir(&dir, &legacy);
        assert!(dir.join("profiles.json").exists());
        assert!(!previous.exists());
    }

    /// Windows: `.dialog` takes over from the identifier-named folders, newest first.
    #[test]
    fn moves_the_first_existing_legacy_folder_once() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".dialog");
        let old_id = tmp.path().join("pm.dialog.chat");
        let older = tmp.path().join(LEGACY_IDENTIFIERS[0]);
        std::fs::create_dir_all(older.join("profiles")).unwrap();
        std::fs::create_dir_all(old_id.join("profiles")).unwrap();
        std::fs::write(old_id.join("profiles.json"), b"{}").unwrap();
        migrate_legacy_data_dir(&dir, &[old_id.clone(), older.clone()]);
        assert!(dir.join("profiles.json").exists(), "the newest earlier folder became the current one");
        assert!(!old_id.exists());
        assert!(older.exists(), "only the first match moves");
        // A second start changes nothing.
        migrate_legacy_data_dir(&dir, &[old_id, older.clone()]);
        assert!(older.exists());
    }

    #[test]
    fn nothing_to_move_keeps_a_missing_dir_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".dialog");
        migrate_legacy_data_dir(&dir, &[tmp.path().join("none")]);
        assert!(!dir.exists());
    }
}

/// WebKitGTK ships with media capture (and WebRTC) disabled and denies permission requests nobody
/// handles, so getUserMedia (voice notes, QR scanning) would never work on Linux. macOS and
/// Windows ask the user through the OS instead.
#[cfg(target_os = "linux")]
fn enable_media_capture(webview: tauri::webview::PlatformWebview) {
    use webkit2gtk::glib::prelude::*;
    use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt};
    let view = webview.inner();
    if let Some(settings) = WebViewExt::settings(&view) {
        settings.set_enable_media_stream(true);
        settings.set_enable_mediasource(true);
        // Voice calls (WebRTC). Set as a property so older WebKitGTK builds without it still work.
        if settings.find_property("enable-webrtc").is_some() {
            if !settings.property::<bool>("enable-webrtc") {
                settings.set_property("enable-webrtc", true);
                // The page was created before this setting: reload so it gets RTCPeerConnection.
                view.reload();
            }
        } else {
            log::warn!("this WebKitGTK has no WebRTC support: voice calls are unavailable");
        }
    }
    view.connect_permission_request(|_, request| {
        if request.downcast_ref::<UserMediaPermissionRequest>().is_some() {
            request.allow();
            return true;
        }
        false
    });
}

/// The app's own pages (the bundled UI, or the dev server in debug builds). The webview may
/// navigate only there: a message link, a dropped file or injected markup must never replace
/// the app with another page that could then call the commands.
fn is_app_url(url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool {
    let app_origin = match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => url.host_str() == Some("tauri.localhost"),
        _ => false,
    };
    app_origin || (cfg!(debug_assertions) && dev_url.is_some_and(|dev| dev.origin() == url.origin()))
}

/// Creates the main window (configured with `"create": false` in tauri.conf.json) with the
/// navigation guard. New windows (window.open, ctrl/cmd-click on a link) are never created:
/// web links go to the system browser instead.
fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() else {
        return Err(tauri::Error::WindowNotFound);
    };
    let dev_url = app.config().build.dev_url.clone();
    let builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.on_navigation(move |url| {
        let allowed = is_app_url(url, dev_url.as_ref());
        if !allowed {
            log::warn!("blocked navigation to {}://{}", url.scheme(), url.host_str().unwrap_or(""));
        }
        allowed
    });
    #[cfg(desktop)]
    let builder = {
        let handle = app.handle().clone();
        builder.on_new_window(move |url, _| {
            if matches!(url.scheme(), "http" | "https") {
                use tauri_plugin_opener::OpenerExt;
                if let Err(e) = handle.opener().open_url(url.as_str(), None::<&str>) {
                    log::warn!("open link: {e}");
                }
            } else {
                log::warn!("blocked new window for {}:", url.scheme());
            }
            tauri::webview::NewWindowResponse::Deny
        })
    };
    builder.build()?;
    Ok(())
}

struct TauriEvents(AppHandle);

impl EventSink for TauriEvents {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        if let Err(e) = self.0.emit(event, payload) {
            log::warn!("emit {event}: {e}");
        }
    }
}

/// Crash reporting (Sentry) for release builds: panics with their stack traces only. No IP
/// address or other personal data, and the device name is replaced by a fixed label.
fn init_sentry() -> Option<sentry::ClientInitGuard> {
    if cfg!(debug_assertions) {
        return None;
    }
    let mut options = sentry::ClientOptions::default();
    options.release = sentry::release_name!();
    options.send_default_pii = false;
    options.server_name = Some("desktop".into());
    options.max_breadcrumbs = 0;
    Some(sentry::init(("https://4f7f66bdfaeb3fcdbd9b481365af0e47@o667654.ingest.us.sentry.io/4512205463486464", options)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Two TLS crypto providers end up in the build (ring for the chat core, aws-lc-rs through
    // Sentry), so rustls cannot pick one on its own and every connection would fail: choose ring.
    let _ = rustls::crypto::ring::default_provider().install_default();
    // Kept for the whole run: dropping it would stop reporting.
    let _sentry = init_sentry();
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info,chat_core=debug")).try_init();
    let mut context = tauri::generate_context!();
    // Auto-updates only in builds configured with an update signing key (updater.rs).
    let updates = updater::configure(&mut context);
    let mut builder = tauri::Builder::default();
    if updates {
        builder = builder.plugin(updater::plugin());
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("chatmedia", |ctx, request, responder| {
            // Media of the active profile only (it follows profile switches).
            let active = ctx.app_handle().try_state::<profiles::Profiles>().map(|p| (p.core(), p.data_dir()));
            std::thread::spawn(move || {
                let response = match &active {
                    Some((core, dir)) => media::serve(core, dir, &request),
                    None => tauri::http::Response::builder().status(503).body(Vec::new()).expect("valid response"),
                };
                responder.respond(response);
            });
        })
        .setup(move |app| {
            let data_dir = data_dir(app.handle())?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(picked::Picked::default());
            // Starts on the start screen (a blank profile); the accounts on this computer are
            // opened from there with their password (profiles.rs).
            let profiles = profiles::Profiles::start(
                data_dir,
                default_server_url(),
                platform().to_string(),
                Arc::new(TauriEvents(app.handle().clone())),
            )?;
            app.manage(profiles);
            idle::spawn(app.handle().clone());
            #[cfg(target_os = "macos")]
            mac_notify::init();
            create_main_window(app)?;
            if updates {
                updater::spawn_check(app.handle().clone());
            }
            #[cfg(target_os = "linux")]
            for window in app.webview_windows().values() {
                window.with_webview(enable_media_capture)?;
            }
            Ok(())
        })
        .invoke_handler(commands::handler())
        .build(context)
        .expect("error while building Dialog")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Temporary mode: received files must not outlive the session (the in-memory
                // tables go away with the process; startup wipes again after a crash).
                if let Some(profiles) = app.try_state::<profiles::Profiles>() {
                    tauri::async_runtime::block_on(profiles.exit());
                }
            }
        });
}
