# Deviant Audio Engine — coming, do not code over it

Status: **in build, separate repo** — https://github.com/musclehed03/Deviant-Audio-Engine
(Public, GPLv3, created 2026-11-12. Codex is building it there.)

## What it is

A standalone native audio engine for Flow-Tube. Windows-first **WASAPI
exclusive-mode output** — the app takes the output device and nothing else
touches the stream — plus native decode and sample-rate handling, so Flow
stops decoding through the browser. A clean FFI surface Flow's Tauri side
calls later. Linux (ALSA / PipeWire exclusive) plugs into the same interface
afterwards; it is designed for that, not rewritten for it.

Honesty rule, same as Direct mode: the engine reports what the device and
the track actually support. Nothing is labelled bit-perfect that cannot be
proven. Lossy sources stay lossy, and the badge says so.

## Why it lives in its own repo

It is a multi-week per-OS build with licensing questions (native decode).
Building it inside Flow would block everything else. It attaches later, once
it actually plays sound. Flow keeps shipping on Direct mode in the meantime.

## The seams (reserved — build against these, not around them)

| Seam | File | What it is |
|---|---|---|
| Output-engine registry | `src/lib/audio/outputEngine.ts` | `AudioOutputEngine` interface + `outputEngines` registry. Today only `web` is registered. The native engine registers itself as `native` when it lands. Nothing else in the app should pick an output path. |
| Music engine (output stage) | `src/lib/audio/musicAudioEngine.ts` | `MusicAudioEngine` singleton. The native engine replaces what happens *inside* the output stage; the queue, routing and station code above it does not change. |
| AudioContext creation | `src/lib/audio/audioContext.ts` | `createAudioContext()`. Only the web engine creates one. The native engine never goes through here. |
| Output device profiles | `src/lib/audio/outputDeviceProfiles.ts` | `OutputDeviceProfile`, `currentOutputDevice()`. Device identity lives here; the native engine reads it, it does not invent its own device list. |
| Direct mode setting | `music_direct_mode` (fixes/batch-1, merges later) | The user-facing toggle the native engine takes over. Direct mode today means "Flow touches nothing"; with the engine it will mean "the engine owns the device". Do not add a second output-mode toggle. |

## Do NOT build in Flow while the engine is in progress

- No second output path, no other exclusive-mode attempt, no WASAPI code in
  this repo — that is the engine repo's job.
- No relabelling anything bit-perfect. Direct mode's verdict stands: true
  bit-perfect is unachievable on the current stack (lossy sources, browser
  decode, OS mixer).
- No bypassing Direct mode. If a feature needs untouched audio, it goes
  through Direct mode until the engine lands.

## Attach plan (when the engine is ready)

1. The engine exposes its FFI surface; Flow's Tauri side calls it.
2. `native` registers itself in `outputEngines` (one place, this file).
3. `music_direct_mode` routes to the native engine when available, with the
   same honest capability badge per track.
4. No changes to queue, routing, stations, or settings UI beyond that.
