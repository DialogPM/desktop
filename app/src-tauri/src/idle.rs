//! Presence on the desktop: the account shows online only while the user is at one of their
//! devices. Here that means keyboard or mouse input anywhere on the computer within
//! IDLE_AFTER (a locked screen counts as idle); the core tells the server
//! (chat-core engine/net.rs `set_presence_active`), with the time the user went away as their
//! "last seen".

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::profiles::Profiles;

const IDLE_AFTER_SECS: u64 = 5 * 60;
const POLL: Duration = Duration::from_secs(15);

pub fn spawn(app: AppHandle) {
    let spawned = std::thread::Builder::new().name("idle".into()).spawn(move || loop {
        std::thread::sleep(POLL);
        let Some(idle) = idle_secs() else { return };
        let Some(profiles) = app.try_state::<Profiles>() else { continue };
        let active = idle < IDLE_AFTER_SECS;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
        let since = now - (idle as i64) * 1000;
        // Sent at every poll: the core ignores repeats, and a profile switch gets a new core.
        let core = profiles.core();
        let _ = tauri::async_runtime::block_on(core.run(move |i| async move {
            i.set_presence_active(active, Some(since));
            Ok(())
        }));
    });
    if let Err(e) = spawned {
        log::warn!("idle detection not started: {e}");
    }
}

/// Seconds since the last keyboard or mouse input on the computer.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn idle_secs() -> Option<u64> {
    match user_idle::UserIdle::get_time() {
        Ok(t) => Some(t.as_seconds()),
        Err(e) => {
            log::warn!("idle time unavailable: {e}");
            None
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn idle_secs() -> Option<u64> {
    None
}

