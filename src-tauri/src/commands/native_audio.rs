//! Tauri commands for the Deviant Audio Engine (native output).
//!
//! Thin wrappers over `services::native_audio`: the frontend's native output
//! path probes availability, lists devices, opens an exclusive stream, feeds
//! it decoded PCM, and closes it. An exclusive open that fails is data, not
//! an error — the result carries `exclusive: false` and the engine's reason,
//! so the frontend falls back to the web path with an honest notice instead
//! of guessing. Only unexpected engine failures (invalid handle, poisoned
//! state) surface as command errors.

use tauri::State;

use crate::errors::{AppError, ErrorResponse};
use crate::services::native_audio::{
    NativeAudioCapabilities, NativeAudioDevice, NativeAudioOpenResult,
    NativeAudioState, NativeAudioStreamStatus,
};

/// What the engine can do on this machine, plus the current stream state.
#[tauri::command]
pub fn native_audio_status(
    state: State<'_, NativeAudioState>,
) -> Result<NativeAudioCapabilities, ErrorResponse> {
    state.capabilities().map_err(|error| {
        AppError::Internal(format!("Native audio status failed: {error}")).into()
    })
}

/// The active render endpoints. Empty off Windows. Needs no engine state —
/// device enumeration is a standalone engine call.
#[tauri::command]
pub fn native_audio_devices() -> Result<Vec<NativeAudioDevice>, ErrorResponse> {
    NativeAudioState::devices().map_err(|error| {
        AppError::Internal(format!("Native audio device list failed: {error}")).into()
    })
}

/// Opens an exclusive stream on `device_id` (`None` = the default endpoint)
/// at `sample_rate` / `channels`. The engine negotiates the container
/// representation; the rate and channels never change. Never opens a shared
/// stream.
#[tauri::command]
pub fn native_audio_open(
    state: State<'_, NativeAudioState>,
    device_id: Option<String>,
    sample_rate: u32,
    channels: u16,
) -> Result<NativeAudioOpenResult, ErrorResponse> {
    state
        .open(device_id.as_deref(), sample_rate, channels)
        .map_err(|error| {
            AppError::Internal(format!("Native audio open failed: {error}")).into()
        })
}

/// Feeds interleaved little-endian f32 PCM for the open stream. The bytes
/// must match the negotiated rate and channels; the engine rejects a
/// mismatched or over-full feed instead of resampling or truncating.
#[tauri::command]
pub fn native_audio_feed(
    state: State<'_, NativeAudioState>,
    pcm: Vec<u8>,
    sample_rate: u32,
    channels: u16,
) -> Result<NativeAudioStreamStatus, ErrorResponse> {
    state
        .feed(&pcm, sample_rate, channels)
        .map_err(|error| AppError::Internal(format!("Native audio feed failed: {error}")).into())
}

/// Closes the stream, releasing exclusive control. Safe with no stream open.
#[tauri::command]
pub fn native_audio_close(state: State<'_, NativeAudioState>) -> Result<(), ErrorResponse> {
    state.close().map_err(|error| {
        AppError::Internal(format!("Native audio close failed: {error}")).into()
    })
}
