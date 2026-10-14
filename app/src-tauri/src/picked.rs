//! Files the user picked in a native dialog, handed to the web UI only as opaque tokens.
//!
//! The UI never sees or sends raw file system paths: commands that read a file (attachments,
//! avatars, contact import) or write one (saving an attachment) accept only tokens issued
//! here, after the user chose the file. Script injected into the webview therefore cannot
//! make the app read `~/.ssh/id_rsa` or write into `~/Library/LaunchAgents`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const OPEN: &str = "picked-file:";
const SAVE: &str = "picked-save:";
/// Bound on remembered picks (old ones are forgotten first).
const MAX_PICKS: usize = 512;

#[derive(Default)]
pub struct Picked(Mutex<(HashMap<String, PathBuf>, Vec<String>)>);

impl Picked {
    fn register(&self, prefix: &str, path: PathBuf) -> String {
        let token = format!("{prefix}{}", uuid::Uuid::new_v4().simple());
        let mut g = self.0.lock().unwrap();
        g.0.insert(token.clone(), path);
        g.1.push(token.clone());
        if g.1.len() > MAX_PICKS {
            let old = g.1.remove(0);
            g.0.remove(&old);
        }
        token
    }

    /// The picked file behind an open token.
    pub fn file(&self, token: &str) -> Option<PathBuf> {
        token.starts_with(OPEN).then(|| self.0.lock().unwrap().0.get(token).cloned()).flatten()
    }

    /// The destination behind a save token (single use).
    fn save_target(&self, token: &str) -> Option<PathBuf> {
        token.starts_with(SAVE).then(|| self.0.lock().unwrap().0.remove(token)).flatten()
    }

    /// Replaces the tokens in a command request with the real paths; any other path is refused.
    pub fn resolve_request(&self, command: &str, req: &mut Value) -> Result<(), String> {
        let open = |v: &mut Value, field: &str, allow_empty: bool| -> Result<(), String> {
            let Some(Value::String(s)) = v.get(field).cloned() else { return Ok(()) };
            if s.is_empty() && allow_empty {
                return Ok(());
            }
            let path = self.file(&s).ok_or_else(|| format!("invalid_input: {field} must be a picked file"))?;
            v[field] = Value::String(path.to_string_lossy().into_owned());
            Ok(())
        };
        match command {
            "send_message" => {
                if let Some(Value::Array(atts)) = req.get_mut("attachments") {
                    for a in atts {
                        open(a, "path", false)?;
                    }
                }
            }
            // "" removes the avatar.
            "set_profile" | "create_group" | "update_group" => open(req, "avatar_path", true)?,
            "import_contacts" => open(req, "path", false)?,
            "save_attachment" => {
                let Some(Value::String(s)) = req.get("dest_path").cloned() else { return Ok(()) };
                let path = self.save_target(&s).ok_or("invalid_input: dest_path must come from the save dialog")?;
                req["dest_path"] = Value::String(path.to_string_lossy().into_owned());
            }
            _ => {}
        }
        Ok(())
    }
}

#[derive(Serialize)]
pub struct PickedFileDto {
    /// Opaque token used in place of the path.
    path: String,
    name: String,
    size: Option<u64>,
}

fn dto(picked: &Picked, path: PathBuf) -> PickedFileDto {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let size = std::fs::metadata(&path).ok().map(|m| m.len());
    PickedFileDto { path: picked.register(OPEN, path), name, size }
}

/// Native open dialog; returns tokens for the chosen files.
#[tauri::command]
pub async fn pick_files(
    app: AppHandle,
    picked: State<'_, Picked>,
    multiple: bool,
    extensions: Option<Vec<String>>,
) -> Result<Vec<PickedFileDto>, String> {
    let mut d = app.dialog().file();
    if let Some(ext) = &extensions {
        let ext: Vec<&str> = ext.iter().map(String::as_str).collect();
        d = d.add_filter("files", &ext);
    }
    let paths: Vec<PathBuf> = if multiple {
        d.blocking_pick_files().unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).collect()
    } else {
        d.blocking_pick_file().and_then(|f| f.into_path().ok()).into_iter().collect()
    };
    Ok(paths.into_iter().map(|p| dto(&picked, p)).collect())
}

/// Native save dialog; returns a single-use token for the destination.
#[tauri::command]
pub async fn pick_save_path(app: AppHandle, picked: State<'_, Picked>, default_name: String) -> Result<Option<String>, String> {
    let name = std::path::Path::new(&default_name).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let path = app.dialog().file().set_file_name(&name).blocking_save_file().and_then(|f| f.into_path().ok());
    Ok(path.map(|p| picked.register(SAVE, p)))
}
