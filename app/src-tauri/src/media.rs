//! `chatmedia://` protocol: serves decrypted media (attachments, avatars) from the data
//! directory of the active profile (profiles.rs) to the web UI. Files are encrypted at rest;
//! the core decrypts them (only the requested byte range for audio/video seeking). Replaces Tauri's generic asset protocol: only files inside the
//! app data directory are reachable, it supports HTTP Range requests (audio/video seeking)
//! and behaves the same on macOS, Windows and Linux.

use std::path::{Path, PathBuf};

use chat_core::Core;
use tauri::http::{header, Request, Response, StatusCode};

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(status).body(Vec::new()).expect("valid response")
}

/// Parses `bytes=start-end` (single range).
fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let suffix: u64 = b.parse().ok()?;
        (len.saturating_sub(suffix), len.checked_sub(1)?)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { len.checked_sub(1)? } else { b.parse::<u64>().ok()?.min(len.checked_sub(1)?) };
        (start, end)
    };
    (start <= end && end < len).then_some((start, end))
}

/// Resolves a requested absolute path, confined to the media directories (`media/`,
/// `media-temp/`) and to files stored encrypted (CAMEDIA1): the database, its key files and
/// anything else in the data directory are never served.
fn resolve(data_dir: &Path, requested: &str) -> Result<PathBuf, StatusCode> {
    let Ok(path) = Path::new(requested).canonicalize() else {
        return Err(StatusCode::NOT_FOUND);
    };
    let inside = ["media", "media-temp"]
        .iter()
        .filter_map(|d| data_dir.join(d).canonicalize().ok())
        .any(|root| path.starts_with(root));
    if !inside || !path.is_file() {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut magic = [0u8; 8];
    let encrypted = std::fs::File::open(&path)
        .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut magic))
        .is_ok()
        && &magic == b"CAMEDIA1";
    if !encrypted {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(path)
}

/// Content types served as is; anything else (html, svg, ...) is sent as an opaque download
/// so received files can never run as a page.
fn safe_mime(path: &Path) -> String {
    let m = mime_guess::from_path(path).first_or_octet_stream();
    let ok = matches!(m.type_().as_str(), "image" | "audio" | "video") && m.subtype() != "svg";
    if ok { m.to_string() } else { "application/octet-stream".into() }
}

/// CORS only for the app's own webview origin (macOS/Linux: tauri://localhost, Windows:
/// http(s)://tauri.localhost), so no other page can read decrypted media.
fn allowed_origin(request: &Request<Vec<u8>>) -> Option<header::HeaderValue> {
    let origin = request.headers().get(header::ORIGIN)?;
    let o = origin.to_str().ok()?;
    matches!(o, "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost").then(|| origin.clone())
}

/// Upper bound for media returned over IPC (videos larger than this need the protocol).
const MAX_IPC_MEDIA: u64 = 100 * 1024 * 1024;

/// Image types the UI may preview from outside the data directory (files the user just
/// picked in the file dialog, before sending them).
const PREVIEW_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif"];

fn is_preview_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| PREVIEW_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Reads a media file over IPC. Fallback for webviews where the `chatmedia` protocol
/// cannot be used; the bytes are returned raw (no JSON/base64 overhead).
#[tauri::command]
pub async fn read_media(
    profiles: tauri::State<'_, crate::profiles::Profiles>,
    picked: tauri::State<'_, crate::picked::Picked>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    // An image the user just picked (preview before sending): only through its token.
    if let Some(p) = picked.file(&path) {
        if !p.is_file() || !is_preview_image(&p) {
            return Err("forbidden: only picked images can be previewed".to_string());
        }
        let len = std::fs::metadata(&p).map_err(|e| e.to_string())?.len();
        if len > MAX_IPC_MEDIA {
            return Err("payload_too_large: media file is too large".to_string());
        }
        return std::fs::read(&p).map(tauri::ipc::Response::new).map_err(|e| e.to_string());
    }
    // Only the active profile's media directory (and its core to decrypt).
    let (core, root) = (profiles.core(), profiles.data_dir());
    let checked = {
        let path = path.clone();
        tauri::async_runtime::spawn_blocking(move || resolve(&root, &path).map(|_| ()))
            .await
            .map_err(|e| e.to_string())?
    };
    if let Err(s) = checked {
        return Err(format!("forbidden: media unavailable ({s})"));
    }
    let bytes = core
        .run(move |i| async move { i.read_media_file(Path::new(&path)).await })
        .await
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_IPC_MEDIA {
        return Err("payload_too_large: media file is too large".to_string());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

pub fn serve(core: &Core, data_dir: &Path, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    // chatmedia://localhost/<url-encoded absolute path>  (http://chatmedia.localhost/... on Windows)
    let raw = request.uri().path().trim_start_matches('/');
    if raw == "__probe" {
        // Lets the UI check that this protocol works in the current webview.
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/plain")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, allowed_origin(request).unwrap_or(header::HeaderValue::from_static("null")))
            .body(b"ok".to_vec())
            .expect("valid response");
    }
    let Some(decoded) = percent_decode(raw) else { return error(StatusCode::BAD_REQUEST) };
    let path = match resolve(data_dir, &decoded) {
        Ok(p) => p,
        Err(status) => return error(status),
    };
    // Plaintext size first (from the encrypted file's header), then only the bytes asked for.
    let read = |start: u64, end: Option<u64>| {
        let (core, p) = (core.clone(), path.clone());
        tauri::async_runtime::block_on(core.run(move |i| async move { i.read_media_range(&p, start, end).await }))
    };
    let Ok((_, len)) = read(0, Some(0)) else { return error(StatusCode::NOT_FOUND) };
    let mime = safe_mime(&path);
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| parse_range(v, len));
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CONTENT_SECURITY_POLICY, "sandbox")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, allowed_origin(request).unwrap_or(header::HeaderValue::from_static("null")));
    match range {
        Some((start, end)) => {
            let Ok((buf, _)) = read(start, Some(end + 1)) else { return error(StatusCode::INTERNAL_SERVER_ERROR) };
            builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
                .body(buf)
                .expect("valid response")
        }
        None => {
            let Ok((buf, _)) = read(0, None) else { return error(StatusCode::INTERNAL_SERVER_ERROR) };
            builder.status(StatusCode::OK).body(buf).expect("valid response")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(parse_range("bytes=2000-", 1000), None);
        assert_eq!(percent_decode("%2Fhome%2Fa%20b.png").as_deref(), Some("/home/a b.png"));
    }

    struct NoEvents;
    impl chat_core::EventSink for NoEvents {
        fn emit(&self, _: &str, _: serde_json::Value) {}
    }

    /// The protocol serves the decrypted bytes of an encrypted file, whole and by range.
    #[test]
    fn serves_decrypted_media() {
        let dir = std::env::temp_dir().join(format!("chatmedia-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let core = Core::start(chat_core::CoreConfig {
            data_dir: dir.clone(),
            db_key: [3u8; 32],
            default_server_url: String::new(),
            platform: "test".into(),
            events: std::sync::Arc::new(NoEvents),
        })
        .unwrap();
        let plain: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        let path = dir.join("media").join("clip.mp4");
        let (p, data) = (path.clone(), plain.clone());
        tauri::async_runtime::block_on(core.run(move |i| async move { i.write_media_file(&p, data).await })).unwrap();
        assert_eq!(&std::fs::read(&path).unwrap()[..8], b"CAMEDIA1", "stored encrypted");

        let uri = format!("chatmedia://localhost/{}", path.to_string_lossy().replace('/', "%2F"));
        let full = serve(&core, &dir, &Request::builder().uri(&uri).body(Vec::new()).unwrap());
        assert_eq!(full.status(), StatusCode::OK);
        assert_eq!(full.body(), &plain);
        let ranged = serve(&core, &dir, &Request::builder().uri(&uri).header(header::RANGE, "bytes=70000-140001").body(Vec::new()).unwrap());
        assert_eq!(ranged.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(ranged.headers()[header::CONTENT_RANGE], "bytes 70000-140001/200000");
        assert_eq!(ranged.body(), &plain[70000..=140001]);
        // Unencrypted files (even inside media/) and other files of the data directory: refused.
        let plain_file = dir.join("media").join("plain.png");
        std::fs::write(&plain_file, b"not encrypted").unwrap();
        std::fs::write(dir.join("chat.db.lock"), b"{}").unwrap();
        for p in [plain_file.clone(), dir.join("chat.db.lock")] {
            let uri = format!("chatmedia://localhost/{}", p.to_string_lossy().replace('/', "%2F"));
            let r = serve(&core, &dir, &Request::builder().uri(&uri).body(Vec::new()).unwrap());
            assert_eq!(r.status(), StatusCode::FORBIDDEN, "{}", p.display());
        }
        // No wildcard CORS: only the app's own origin may read decrypted media.
        assert!(full.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none_or(|v| v != "*"));
        assert_eq!(full.headers()[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        // Outside the data directory: refused.
        let outside = serve(&core, &dir, &Request::builder().uri("chatmedia://localhost/%2Fetc%2Fpasswd").body(Vec::new()).unwrap());
        assert_eq!(outside.status(), StatusCode::FORBIDDEN);
        drop(core);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
