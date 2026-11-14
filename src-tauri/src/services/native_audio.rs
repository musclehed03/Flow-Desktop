//! Deviant Audio Engine — native output, Windows-first WASAPI exclusive.
//!
//! Flow's Rust backend calls the engine's `dae_*` functions directly as Rust
//! functions: the engine crate is consumed as a Cargo git dependency (rlib
//! path), and its `ffi` module is public. Its `windows` module is private,
//! so this is the only usable surface — there is no separate DLL to ship, find,
//! or version-skew against; the engine links statically into the app.
//!
//! One engine handle per process, held in Tauri managed state
//! (`NativeAudioState`). The engine never opens a shared stream: an exclusive
//! open that fails reports `exclusive: false` with the engine's reason, and
//! the frontend falls back to the web path with an honest notice. On
//! non-Windows the engine honestly reports `hardware_output_available: false`
//! and every open fails the same way — the same code path, no special-casing.

use deviant_audio_engine::ffi;
use serde::{Deserialize, Serialize};
use std::ffi::{CString, c_char};
use std::sync::Mutex;

/// The format Flow requests: 48 kHz stereo, 24 valid bits in a 32-bit integer
/// container — the same request the standalone hardware test makes. The engine
/// negotiates sample representations at the same rate and channels; it never
/// substitutes another rate or layout.
pub const NATIVE_REQUEST_CONTAINER_BITS: u16 = 32;
pub const NATIVE_REQUEST_VALID_BITS: u16 = 24;

/// One render endpoint, as the engine enumerates it.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeAudioDevice {
    pub id: String,
    pub name: String,
}

/// The PCM representation the device actually accepted.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeAudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub container_bits: u16,
    pub valid_bits: u16,
    pub float: bool,
}

/// The live stream snapshot the engine reports.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NativeAudioStreamStatus {
    pub active: bool,
    pub exclusive: bool,
    pub format: Option<NativeAudioFormat>,
    pub error: Option<String>,
    pub underrun_frames: u64,
    pub queued_frames: usize,
    pub pending_device_frames: usize,
}

/// What the engine can do on this machine, plus the current stream state.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NativeAudioCapabilities {
    pub hardware_output_available: bool,
    pub supported_decoders: Vec<String>,
    pub stream: NativeAudioStreamStatus,
}

/// The result of an exclusive-open attempt. A failure is data, not an error:
/// `exclusive` is false and `error` carries the engine's reason, so the
/// caller can fall back honestly instead of guessing.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NativeAudioOpenResult {
    pub exclusive: bool,
    pub format: Option<NativeAudioFormat>,
    pub error: Option<String>,
}

/// The engine handle for this process. Created lazily on first use; the engine
/// is process-scoped, so there is no shutdown to run at exit.
pub struct NativeAudioState {
    handle: Mutex<Option<u64>>,
}

impl Default for NativeAudioState {
    fn default() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }
}

/// Reads a NUL-terminated engine string: probe the size, then fetch it.
/// Mirrors the engine's own hardware test.
fn abi_string(mut call: impl FnMut(*mut c_char, usize) -> usize) -> Result<String, String> {
    for _ in 0..8 {
        let size = call(std::ptr::null_mut(), 0);
        if size == 0 {
            return Err("engine could not return text".into());
        }
        if size > 16 * 1024 * 1024 {
            return Err("engine text response exceeds limit".into());
        }
        let mut buf = vec![0u8; size];
        let required = call(buf.as_mut_ptr().cast(), buf.len());
        if required == 0 {
            return Err("engine text query failed".into());
        }
        if required <= buf.len() {
            if buf[required - 1] != 0 {
                return Err("engine text was not NUL terminated".into());
            }
            return String::from_utf8(buf[..required - 1].to_vec()).map_err(|e| e.to_string());
        }
    }
    Err("engine text size kept changing; giving up".into())
}

fn last_error() -> String {
    abi_string(|p, n| unsafe { ffi::dae_last_error(p, n) })
        .unwrap_or_else(|_| "engine error unavailable".into())
}

/// The engine's capabilities JSON: only the fields Flow reads.
#[derive(Deserialize)]
struct CapabilitiesJson {
    #[serde(default)]
    hardware_output_available: bool,
    #[serde(default)]
    supported_decoders: Vec<String>,
    #[serde(default)]
    stream: NativeAudioStreamStatus,
}

impl NativeAudioState {
    fn handle(&self) -> Result<u64, String> {
        let mut slot = self
            .handle
            .lock()
            .map_err(|_| "native audio state poisoned".to_string())?;
        if let Some(id) = *slot {
            return Ok(id);
        }
        let id = ffi::dae_init();
        if id == 0 {
            return Err(last_error());
        }
        *slot = Some(id);
        Ok(id)
    }

    fn capabilities_json(id: u64) -> Result<NativeAudioCapabilities, String> {
        let text = abi_string(|p, n| unsafe { ffi::dae_capabilities_json(id, p, n) })
            .map_err(|e| format!("{e}: {}", last_error()))?;
        let parsed: CapabilitiesJson = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        Ok(NativeAudioCapabilities {
            hardware_output_available: parsed.hardware_output_available,
            supported_decoders: parsed.supported_decoders,
            stream: parsed.stream,
        })
    }

    /// What the engine can do here, plus the current stream state.
    pub fn capabilities(&self) -> Result<NativeAudioCapabilities, String> {
        let id = self.handle()?;
        Self::capabilities_json(id)
    }

    /// The active render endpoints. Empty off Windows. Device enumeration
    /// needs no engine handle — `dae_devices_json` is standalone.
    pub fn devices() -> Result<Vec<NativeAudioDevice>, String> {
        let text = abi_string(|p, n| unsafe { ffi::dae_devices_json(p, n) })
            .map_err(|e| format!("{e}: {}", last_error()))?;
        serde_json::from_str(&text).map_err(|e| e.to_string())
    }

    /// Opens an exclusive stream on `device_id` (`None` = the default
    /// endpoint) at `sample_rate` / `channels`. The engine negotiates the
    /// container representation; the rate and channels never change. Never
    /// opens a shared stream: on failure the result carries `exclusive: false`
    /// and the engine's reason.
    pub fn open(
        &self,
        device_id: Option<&str>,
        sample_rate: u32,
        channels: u16,
    ) -> Result<NativeAudioOpenResult, String> {
        if !(8000..=384_000).contains(&sample_rate) {
            return Err(format!("unsupported sample rate: {sample_rate} Hz"));
        }
        if !(1..=2).contains(&channels) {
            return Err(format!("unsupported channel count: {channels}"));
        }
        let id = self.handle()?;
        let device = match device_id {
            Some(device) => Some(CString::new(device).map_err(|e| e.to_string())?),
            None => None,
        };
        let device_ptr = device.as_ref().map_or(std::ptr::null(), |c| c.as_ptr());
        let code = unsafe {
            ffi::dae_open_exclusive(
                id,
                device_ptr,
                sample_rate,
                channels,
                NATIVE_REQUEST_CONTAINER_BITS,
                NATIVE_REQUEST_VALID_BITS,
                0,
            )
        };
        if code != 0 {
            return Ok(NativeAudioOpenResult {
                exclusive: false,
                format: None,
                error: Some(last_error()),
            });
        }
        let status = Self::capabilities_json(id)?.stream;
        Ok(NativeAudioOpenResult {
            exclusive: status.active && status.exclusive,
            format: status.format,
            error: status.error,
        })
    }

    /// Feeds interleaved little-endian f32 PCM for the open stream. The bytes
    /// must match the negotiated rate and channels; the engine rejects a
    /// mismatched, empty, or over-full feed instead of resampling or
    /// truncating. Returns the stream snapshot after the feed.
    pub fn feed(
        &self,
        pcm_bytes: &[u8],
        sample_rate: u32,
        channels: u16,
    ) -> Result<NativeAudioStreamStatus, String> {
        if pcm_bytes.is_empty() || !pcm_bytes.len().is_multiple_of(4) {
            return Err("PCM feed must be whole f32 samples".into());
        }
        // The engine takes &[f32]; the byte buffer is not f32-aligned, so
        // decode instead of reinterpreting the pointer. The length check
        // above guarantees the remainder is empty.
        let (chunks, _remainder) = pcm_bytes.as_chunks::<4>();
        let samples: Vec<f32> = chunks
            .iter()
            .map(|chunk| f32::from_le_bytes(*chunk))
            .collect();
        let id = self.handle()?;
        let code = unsafe {
            ffi::dae_feed_frames(id, samples.as_ptr(), samples.len(), sample_rate, channels)
        };
        if code != 0 {
            return Err(last_error());
        }
        Ok(Self::capabilities_json(id)?.stream)
    }

    /// Closes the stream, releasing exclusive control. Safe to call with no
    /// stream open.
    pub fn close(&self) -> Result<(), String> {
        let id = self.handle()?;
        let code = ffi::dae_close_stream(id);
        if code != 0 {
            return Err(last_error());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abi_string_probes_then_fetches() {
        let text = abi_string(|out, capacity| {
            let wanted = b"exclusive held\0";
            if out.is_null() || capacity == 0 {
                return wanted.len();
            }
            let take = wanted.len().min(capacity);
            unsafe {
                std::ptr::copy_nonoverlapping(wanted.as_ptr().cast(), out, take);
            }
            wanted.len()
        })
        .unwrap();
        assert_eq!(text, "exclusive held");
    }

    #[test]
    fn abi_string_rejects_missing_nul() {
        let err = abi_string(|out, capacity| {
            if out.is_null() || capacity == 0 {
                return 4;
            }
            unsafe {
                std::ptr::copy_nonoverlapping(b"nope".as_ptr().cast(), out, 4);
            }
            4
        })
        .unwrap_err();
        assert!(err.contains("NUL"), "{err}");
    }

    #[test]
    fn capabilities_json_parses_honest_status() {
        let parsed: NativeAudioCapabilities = serde_json::from_str(
            r#"{"abi_version":1,"hardware_output_available":true,
            "supported_decoders":["aac-lc","flac"],
            "stream":{"active":true,"exclusive":true,
            "format":{"sample_rate":48000,"channels":2,"container_bits":32,"valid_bits":24,"float":false},
            "error":null,"underrun_frames":3,"queued_frames":120,"pending_device_frames":64}}"#,
        )
        .unwrap();
        assert!(parsed.hardware_output_available);
        assert!(parsed.stream.active);
        assert!(parsed.stream.exclusive);
        assert_eq!(parsed.stream.format.unwrap().valid_bits, 24);
        assert_eq!(parsed.stream.underrun_frames, 3);
    }

    #[test]
    fn devices_json_parses() {
        let devices: Vec<NativeAudioDevice> =
            serde_json::from_str(r#"[{"id":"{0.0.0.00000000}.{abc}","name":"CM01 DAC"}]"#).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name, "CM01 DAC");
    }

    #[test]
    fn open_rejects_impossible_formats_before_touching_the_engine() {
        let state = NativeAudioState::default();
        assert!(state.open(None, 0, 2).is_err());
        assert!(state.open(None, 48000, 0).is_err());
        assert!(state.open(None, 48000, 3).is_err());
    }

    #[test]
    fn feed_rejects_unaligned_bytes() {
        let state = NativeAudioState::default();
        assert!(state.feed(&[0u8; 3], 48000, 2).is_err());
        assert!(state.feed(&[], 48000, 2).is_err());
    }

    // WASAPI exists only on Windows: every other platform must get the honest
    // "not available" answer, never a faked stream.
    #[cfg(not(windows))]
    #[test]
    fn unsupported_platform_is_honest() {
        let state = NativeAudioState::default();
        let caps = state.capabilities().unwrap();
        assert!(!caps.hardware_output_available);
        assert_eq!(NativeAudioState::devices().unwrap(), Vec::new());
        let opened = state.open(None, 48000, 2).unwrap();
        assert!(!opened.exclusive);
        assert!(opened.format.is_none());
        let reason = opened.error.unwrap();
        assert!(reason.contains("Windows"), "{reason}");
        assert!(reason.contains("no shared stream"), "{reason}");
    }

    #[cfg(not(windows))]
    #[test]
    fn feed_without_an_open_stream_fails() {
        let state = NativeAudioState::default();
        let err = state.feed(&0f32.to_le_bytes(), 48000, 2).unwrap_err();
        assert!(err.contains("no output stream"), "{err}");
    }
}
