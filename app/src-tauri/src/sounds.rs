//! Notification and call sounds played natively. WebKit suspends / interrupts the webview's
//! AudioContext while the window is in the background, and restarting it delays the sound by a
//! few seconds — exactly when a message notification matters. The tones are the same as the
//! Web Audio ones in `src/lib/sounds.ts` (synthesized, no audio files).
//!
//! A dedicated thread owns the output device: it is opened on the first sound and closed after
//! a minute without sounds, so bursts of messages play instantly without keeping the audio
//! device busy all the time.

use std::num::NonZero;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use rodio::buffer::SamplesBuffer;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player, Source};

const RATE: u32 = 48_000;
/// The output device is released after this long without sounds.
const IDLE_CLOSE: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sound {
    /// New message in a chat that is not open (or the app is in the background).
    Incoming,
    /// New message in the chat currently open: short and quieter.
    InChat,
    /// Incoming call (loops until stopped).
    Ringtone,
    /// Outgoing call while the other side rings (loops until stopped).
    Ringback,
}

impl Sound {
    pub fn parse(name: &str) -> Option<Sound> {
        Some(match name {
            "incoming" => Sound::Incoming,
            "in_chat" => Sound::InChat,
            "ringtone" => Sound::Ringtone,
            "ringback" => Sound::Ringback,
            _ => return None,
        })
    }

    fn looping(self) -> bool {
        matches!(self, Sound::Ringtone | Sound::Ringback)
    }

    /// One period of the sound (a loop repeats it).
    fn render(self) -> Vec<f32> {
        match self {
            Sound::Incoming => render(&[(880.0, 0.0, 0.32, 0.16), (1318.5, 0.11, 0.42, 0.13)], 0.6),
            Sound::InChat => render(&[(987.8, 0.0, 0.16, 0.07)], 0.25),
            // About twice the level of the message sounds: a call must be heard across the room.
            // Two notes overlap at most (0.42 + 0.36 stays below clipping).
            Sound::Ringtone => render(
                &[(784.0, 0.0, 0.28, 0.42), (1046.5, 0.14, 0.32, 0.36), (784.0, 0.32, 0.28, 0.42), (1046.5, 0.46, 0.32, 0.36)],
                2.0,
            ),
            Sound::Ringback => render(&[(440.0, 0.0, 1.1, 0.06), (480.0, 0.0, 1.1, 0.05)], 3.0),
        }
    }
}

/// Bell-like notes `(frequency, start s, duration s, volume)`: sine + a quiet octave, 12 ms
/// exponential attack and exponential decay (the Web Audio envelope of sounds.ts).
fn render(notes: &[(f32, f32, f32, f32)], length: f32) -> Vec<f32> {
    const FLOOR: f32 = 0.0001;
    const ATTACK: f32 = 0.012;
    let mut out = vec![0.0f32; (length * RATE as f32) as usize];
    for &(freq, start, duration, volume) in notes {
        let from = (start * RATE as f32) as usize;
        let count = ((duration + 0.05) * RATE as f32) as usize;
        for i in 0..count {
            let Some(sample) = out.get_mut(from + i) else { break };
            let t = i as f32 / RATE as f32;
            let gain = if t < ATTACK {
                FLOOR * (volume / FLOOR).powf(t / ATTACK)
            } else if t < duration {
                volume * (FLOOR / volume).powf((t - ATTACK) / (duration - ATTACK))
            } else {
                0.0
            };
            let w = std::f32::consts::TAU * freq * t;
            *sample += gain * (w.sin() + 0.18 * (2.0 * w).sin());
        }
    }
    out
}

enum Cmd {
    Play(Sound),
    /// Stops the ringtone / ringback.
    StopLoop,
}

fn sender() -> &'static Mutex<Sender<Cmd>> {
    static TX: OnceLock<Mutex<Sender<Cmd>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Cmd>();
        std::thread::Builder::new()
            .name("sounds".into())
            .spawn(move || audio_thread(rx))
            .expect("spawn sound thread");
        Mutex::new(tx)
    })
}

fn send(cmd: Cmd) {
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(cmd);
    }
}

pub fn play(sound: Sound) {
    send(Cmd::Play(sound));
}

pub fn stop_loop() {
    send(Cmd::StopLoop);
}

fn audio_thread(rx: mpsc::Receiver<Cmd>) {
    let mut device: Option<MixerDeviceSink> = None;
    let mut looping: Option<Player> = None;
    loop {
        let cmd = match rx.recv_timeout(IDLE_CLOSE) {
            Ok(cmd) => cmd,
            Err(RecvTimeoutError::Timeout) => {
                if looping.as_ref().is_none_or(|p| p.empty()) {
                    looping = None;
                    device = None;
                }
                continue;
            }
            Err(RecvTimeoutError::Disconnected) => return,
        };
        match cmd {
            Cmd::StopLoop => {
                if let Some(p) = looping.take() {
                    p.stop();
                }
            }
            Cmd::Play(sound) => {
                if device.is_none() {
                    match DeviceSinkBuilder::open_default_sink() {
                        Ok(mut d) => {
                            d.log_on_drop(false);
                            device = Some(d);
                        }
                        Err(e) => {
                            log::warn!("no audio output for sounds: {e}");
                            continue;
                        }
                    }
                }
                let Some(d) = device.as_ref() else { continue };
                let buffer = SamplesBuffer::new(NonZero::<u16>::MIN, NonZero::new(RATE).expect("rate"), sound.render());
                let player = Player::connect_new(d.mixer());
                if sound.looping() {
                    if let Some(p) = looping.take() {
                        p.stop();
                    }
                    player.append(buffer.repeat_infinite());
                    looping = Some(player);
                } else {
                    player.append(buffer);
                    player.detach();
                }
            }
        }
    }
}

#[tauri::command]
pub fn play_sound(name: String) -> Result<(), String> {
    let sound = Sound::parse(&name).ok_or_else(|| format!("unknown sound {name}"))?;
    play(sound);
    Ok(())
}

#[tauri::command]
pub fn stop_sound() {
    stop_loop();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tones_are_audible_and_bounded() {
        for s in [Sound::Incoming, Sound::InChat, Sound::Ringtone, Sound::Ringback] {
            let pcm = s.render();
            let peak = pcm.iter().fold(0.0f32, |m, v| m.max(v.abs()));
            assert!(peak > 0.03 && peak < 1.0, "{s:?} peak {peak}");
        }
        assert_eq!(Sound::parse("incoming"), Some(Sound::Incoming));
        assert_eq!(Sound::parse("x"), None);
    }
}
