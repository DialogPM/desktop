//! Unread counter on the app icon. macOS (Dock) and Linux launchers show a native badge;
//! the Windows taskbar has no badge API, so the count is drawn as a small overlay icon on the
//! taskbar button (like other messengers do).

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn set_unread_badge(app: AppHandle, count: u32) -> Result<(), String> {
    log::info!("badge: unread count {count}");
    let Some(window) = app.get_webview_window("main") else { return Ok(()) };
    #[cfg(target_os = "windows")]
    {
        let icon = (count > 0).then(|| {
            let (rgba, size) = overlay_rgba(count);
            tauri::image::Image::new_owned(rgba, size, size)
        });
        window.set_overlay_icon(icon).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.set_badge_count((count > 0).then_some(i64::from(count))).map_err(|e| e.to_string())
    }
}

/// 3×5 pixel glyphs for the digits and "+", one row per byte (3 low bits, left = 0b100).
const GLYPHS: [(char, [u8; 5]); 11] = [
    ('0', [0b111, 0b101, 0b101, 0b101, 0b111]),
    ('1', [0b010, 0b110, 0b010, 0b010, 0b111]),
    ('2', [0b111, 0b001, 0b111, 0b100, 0b111]),
    ('3', [0b111, 0b001, 0b111, 0b001, 0b111]),
    ('4', [0b101, 0b101, 0b111, 0b001, 0b001]),
    ('5', [0b111, 0b100, 0b111, 0b001, 0b111]),
    ('6', [0b111, 0b100, 0b111, 0b101, 0b111]),
    ('7', [0b111, 0b001, 0b010, 0b010, 0b010]),
    ('8', [0b111, 0b101, 0b111, 0b101, 0b111]),
    ('9', [0b111, 0b101, 0b111, 0b001, 0b111]),
    ('+', [0b000, 0b010, 0b111, 0b010, 0b000]),
];

/// A red disc with the count in white ("9+" above 9: the overlay is only 16 px on screen),
/// as RGBA pixels of a square image.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn overlay_rgba(count: u32) -> (Vec<u8>, u32) {
    const SIZE: u32 = 32;
    let text = if count > 9 { "9+".to_string() } else { count.to_string() };
    let mut px = vec![0u8; (SIZE * SIZE * 4) as usize];
    let c = (SIZE as f32 - 1.0) / 2.0;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let d = ((x as f32 - c).powi(2) + (y as f32 - c).powi(2)).sqrt();
            // Anti-aliased edge over one pixel.
            let a = (c + 0.5 - d).clamp(0.0, 1.0);
            if a > 0.0 {
                let i = ((y * SIZE + x) * 4) as usize;
                px[i..i + 4].copy_from_slice(&[0xE5, 0x48, 0x4D, (a * 255.0) as u8]);
            }
        }
    }
    // Glyphs scaled ×4 (one digit) or ×3 (two characters), centred, 1 glyph-pixel spacing.
    let scale: u32 = if text.len() == 1 { 4 } else { 3 };
    let width = text.len() as u32 * 3 * scale + (text.len() as u32 - 1) * scale;
    let (x0, y0) = ((SIZE - width) / 2, (SIZE - 5 * scale) / 2);
    for (n, ch) in text.chars().enumerate() {
        let Some((_, rows)) = GLYPHS.iter().find(|(g, _)| *g == ch) else { continue };
        let gx = x0 + n as u32 * 4 * scale;
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..3u32 {
                if bits & (0b100 >> col) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let (x, y) = (gx + col * scale + dx, y0 + row as u32 * scale + dy);
                        let i = ((y * SIZE + x) * 4) as usize;
                        px[i..i + 4].copy_from_slice(&[0xFF, 0xFF, 0xFF, 0xFF]);
                    }
                }
            }
        }
    }
    (px, SIZE)
}

#[cfg(test)]
mod tests {
    use super::overlay_rgba;

    fn white(px: &[u8]) -> usize {
        px.chunks(4).filter(|p| p == &[0xFF, 0xFF, 0xFF, 0xFF]).count()
    }

    #[test]
    fn overlay_draws_the_count() {
        let (one, size) = overlay_rgba(1);
        assert_eq!(one.len(), (size * size * 4) as usize);
        // "1" has 8 lit glyph pixels at scale 4.
        assert_eq!(white(&one), 8 * 16);
        let (many, _) = overlay_rgba(150);
        // "9+" = 12 + 5 lit pixels at scale 3.
        assert_eq!(white(&many), (12 + 5) * 9);
        // Corners stay transparent.
        assert_eq!(one[3], 0);
    }
}
