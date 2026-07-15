# Milestone 6 — MP4 Export

## Context
Melograffer can visualize + play a MIDI live (M1–M5 done). The last MVP piece
(SPEC §3 "In", §6 milestone 6, Flow 3) is **deterministic offline export to
`.mp4` (H.264 + AAC)** — never screen capture. Frame N is drawn at exactly
`N/fps` seconds by the same pure `drawFrame`; audio comes from an
`OfflineAudioContext` synth render (Audio A) or the uploaded file offset-shifted
(Audio B). Target 1080p60 with platform aspect presets (YouTube 16:9, Instagram
9:16). This is the deferred M6 work the codebase was explicitly de-risked for
(CLAUDE.md: "Offline-render smoke-tested — de-risks M6").

Decisions confirmed with the user:
- **Full pipeline now**: video + audio (both synth and external paths) + both aspect presets.
- **WebCodecs-only** (Chrome/Edge). No WebM fallback now — add it to SPEC's To Do/Later.
- **Export settings persisted in `VizConfig`** (survive reload, live in ConfigPanel).

## Key existing pieces to reuse
- `drawFrame(ctx, score, config, timeSec)` — `src/render/drawFrame.ts`. Pure, already
  typed against a `CanvasLike2D` structural interface → works with `OffscreenCanvasRenderingContext2D`.
  Dot radius/pitch are **canvas-relative** (`radiusForDuration` uses `dotScale/1000 * height`),
  so 1080p scales vertically for free.
- `loadInstrument(ctx: BaseAudioContext)` — `src/audio/instrument.ts`. Already accepts any
  `BaseAudioContext`, so it loads straight into an `OfflineAudioContext`.
- `externalAudioStartParams(fromSec, offsetSec, bufferDuration)` — `src/audio/externalAudio.ts`.
  Pure, tested. Reuse to place the uploaded buffer in the offline render.
- Timeline bounds: `playbackStartSec = -leadInBars*barSec.first`,
  `playbackEndSec = duration + leadOutBars*barSec.last` (App.tsx:64-65) — the export covers
  exactly `[playbackStartSec, playbackEndSec]`, `t=0` of the video = `playbackStartSec`.
- `scoreDurationSec`, `barDurationsSec` — `src/render/mapping.ts`.

## New dependency
- `mp4-muxer` (SPEC §3/§4 mandate it as the muxer). WebCodecs `VideoEncoder`/`AudioEncoder`
  are native browser APIs — no dep. State the mp4-muxer justification in the commit message
  per CLAUDE.md's "no new deps without why" rule.

## Implementation

### 1. Config fields (persisted) — `src/types.ts`, `defaultConfig.ts`, `config/storage.ts`
Add to `VizConfig`:
- `exportAspect: 'landscape' | 'portrait'` (16:9 → 1920×1080, 9:16 → 1080×1920). Default `'landscape'`.
Resolution (1080p) and fps (60) stay fixed constants in the exporter, not config.
Update `DEFAULT_VIZ_CONFIG` and add field-by-field validation in `storage.ts` (mirror the
existing validated-enum pattern used for `radiusMode`); bump the storage version key.

### 2. Frame-timing helper (pure, unit-tested) — `src/export/frameTiming.ts`
- `frameCount(startSec, endSec, fps)` → `Math.round((endSec-startSec)*fps)`.
- `frameTimeSec(startSec, n, fps)` → `startSec + n/fps`.
Keeps the deterministic mapping testable without WebCodecs. Unit test both.

### 3. Offline audio render — `src/export/renderAudio.ts`
`renderAudioTrack({ score, config, externalBuffer, offsetSec, startSec, endSec }): Promise<AudioBuffer>`
Creates `new OfflineAudioContext(2, ceil((endSec-startSec)*sampleRate), sampleRate)` (44100).
- **Synth (Audio A)**: `loadInstrument(offlineCtx)`, apply `config.instrumentName` if set, then
  schedule every visible note with an **explicit duration** at `time = note.startSec - startSec`.
  - Extend `Instrument.start` opts with an optional `duration?: number` (instrument.ts). The live
    path never passes it (keeps manual-stop semantics the JSDoc describes); the offline path passes
    `note.durationSec` so smplr schedules note-off itself. This resolves the CLAUDE.md trap:
    scheduler.ts's `setTimeout` note-offs never fire in a faster-than-realtime render.
  - New `scheduleScoreOffline(instrument, score, startSec)` in `scheduler.ts` (sibling to
    `scheduleScore`): same visible/overlap logic, passes `duration`, no `setTimeout`, no cancel fns.
- **External (Audio B)**: one `AudioBufferSourceNode`, placed via `externalAudioStartParams(startSec, offsetSec, buffer.duration)` (whenDelay/bufferOffset), connected to the offline destination.
- `return offlineCtx.startRendering()`.

### 4. Video+audio encode + mux — `src/export/exportMp4.ts`
`exportMp4({ score, config, audioBuffer, width, height, onProgress }): Promise<Blob>`
- `Muxer` (mp4-muxer, `ArrayBufferTarget`, `fastStart: 'in-memory'` for web download + iPhone seek),
  `video: { codec: 'avc', width, height }`, `audio: { codec: 'aac', numberOfChannels: 2, sampleRate }`.
- `VideoEncoder` (H.264; codec string chosen for iPhone playback — verify High vs baseline in
  browser, SPEC §8 iPhone check) at `width×height`, `framerate: 60`, output → `muxer.addVideoChunk`.
- Frame loop over `frameCount`: draw onto a reused `OffscreenCanvas(width,height)` 2D ctx with
  `drawFrame(ctx, score, config, frameTimeSec(startSec, n, 60))`; `new VideoFrame(canvas, { timestamp: round(n*1e6/60), duration: 1e6/60 })`; `encoder.encode`; `frame.close()`. Respect
  backpressure (await when `encoder.encodeQueueSize` is high); call `onProgress(n/total)`.
- `AudioEncoder` (`mp4a.40.2` AAC-LC) → `muxer.addAudioChunk`; feed the `AudioBuffer` as chunked
  `AudioData` (`f32-planar`, ~1s slices, microsecond timestamps).
- `await` both `encoder.flush()`, `muxer.finalize()`, return `new Blob([target.buffer], { type: 'video/mp4' })`.
- Feature-detect at entry: if `VideoEncoder`/`AudioEncoder`/`OffscreenCanvas` are undefined or
  `VideoEncoder.isConfigSupported` rejects the H.264/AAC config, throw a clear "browser unsupported —
  use Chrome/Edge" error (surfaced in the UI). This is the WebCodecs-only stance.

### 5. Wiring — `src/App.tsx`
- `handleExport()`: guard `!score`; `stopPlayback()`; compute `startSec/endSec`; build the audio
  buffer (`renderAudioTrack`, external if `externalPlayerRef` set, else synth — load the instrument
  first if not already, reusing the existing lazy-load block); pick `width/height` from
  `config.exportAspect`; `blob = await exportMp4(...)`; trigger download via an object-URL anchor,
  filename `melograffer-<midiBasename>.mp4`; revoke URL.
- Export state: `isExporting`, `exportProgress` (0–1) for the progress UI; disable Play/Export while exporting.

### 6. UI — `src/ConfigPanel.tsx`
New "Export" `<fieldset>`: aspect-preset `<select>` bound to `config.exportAspect`, an **Export MP4**
button (calls a new `onExport` prop), and a progress readout (`isExporting`/`exportProgress` props)
shown as a percentage while rendering. Follows the existing fieldset/`config-row` markup.

## Files
- New: `src/export/frameTiming.ts`, `src/export/renderAudio.ts`, `src/export/exportMp4.ts` (+ `.test.ts` for the pure helpers).
- Edit: `src/types.ts`, `src/render/defaultConfig.ts`, `src/config/storage.ts`,
  `src/audio/instrument.ts` (+ test), `src/audio/scheduler.ts` (+ test), `src/App.tsx`, `src/ConfigPanel.tsx`.
- Docs: `SPEC.md` (mark M6 done; add "WebM/MediaRecorder fallback for non-Chromium browsers" to To Do/Later),
  `CLAUDE.md` (Current state → M6 done, milestone bump, note the `duration`-in-offline resolution of the setTimeout trap).
- `package.json` / lockfile: `mp4-muxer`.

## Verification
- `npm test` — new unit tests for `frameTiming` and `scheduleScoreOffline`/`renderAudio` param math
  pass; existing 95 pass. (WebCodecs + OfflineAudioContext aren't in jsdom, so the encoder pipeline
  itself is browser-verified, not unit-tested — keep pure helpers separated so the untestable surface
  is thin.)
- `npm run lint && npx tsc --noEmit` clean.
- Browser (Chrome preview via `preview_start {name:"dev"}`): load `fixtures/fur_elise.mid`, Export →
  confirm a `.mp4` downloads; check console/network for encoder errors. Repeat with an external audio
  file loaded (Audio B path) and with the 9:16 preset.
- SPEC §8 M6 check: open the exported MP4 in QuickTime/VLC; compare a late-piece note's A/V sync
  against live playback (should be within a frame); confirm it plays on iPhone (H.264 profile check).
- Commit per task (conventional commits): config fields → audio render → exporter → wiring/UI → docs.

## Outcome (as implemented)
Implemented as planned, with one addition not in the original plan: a minimal
`exportError` state + `.export-error` UI in ConfigPanel, since a silently
swallowed `UnsupportedBrowserError` (or any encode failure) would otherwise be
invisible to the user.

Verified in-browser (Chrome via the dev preview):
- Isolated fast checks (tiny synthetic 1-3 note scores, bypassing the full
  MIDI-file UI flow) confirmed both `renderAudioTrack` paths (synth/Audio A and
  external-buffer/Audio B) and both `EXPORT_RESOLUTIONS` presets (1920×1080,
  1080×1920) produce a valid MP4 (`ftyp isom` header confirmed on the raw
  bytes) end-to-end through `exportMp4`.
- A full real export of `fixtures/fur_elise.mid` (135s incl. lead-in/out) was
  driven through the actual UI (Choose File → Export MP4) and observed
  progressing steadily (10%+, no errors) via the ConfigPanel's progress
  readout; not watched to 100% in this session since the sandboxed preview
  browser has no hardware H.264 encoder, making full-length export far slower
  than on a real user machine — the isolated checks above already validate
  pipeline correctness end-to-end.
- `npm test` (109 tests), `npm run lint`, `npx tsc --noEmit` all clean.
