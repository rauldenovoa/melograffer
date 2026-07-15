# CLAUDE.md — Melograffer

<!-- HARD LIMIT: keep this file under ~60 lines. It is injected into every turn. -->

## What this is
Client-only MIDI music visualizer (smalin-style scrolling dots) with MP4 export. Full context in SPEC.md — read it at session start.

## Stack
Vite · React 18 · TypeScript strict · Canvas 2D · @tonejs/midi · WebCodecs + mp4-muxer · Vercel (static)

## Commands
- dev: `npm run dev`
- test: `npm test` (vitest)
- lint/typecheck: `npm run lint && npx tsc --noEmit`
- build: `npm run build`

## Conventions
- `drawFrame(ctx, score, config, timeSec)` MUST stay a pure function of its args — live player and exporter both call it. Never let it read clocks, React state, or globals.
- Playback clock is `AudioContext.currentTime`, never `Date.now()`/`performance.now()`.
- Domain types in `src/types.ts`; MIDI parsing isolated in `src/midi/`; rendering in `src/render/`; audio in `src/audio/`; export in `src/export/`.
- No server code, no auth, no DB — static site only (SPEC.md §3 "Never").
- Test fixtures: small public-domain MIDIs in `fixtures/`, committed.
- Conventional commits; commit per milestone task.

## Current state
- Milestone: 6 — MP4 export (see SPEC.md §6) — DONE (2026-07-15)
- M6 done: `src/export/{frameTiming,renderAudio,exportMp4}.ts`. `frameTiming.ts`
  (pure, unit-tested) maps frame N → exactly `startSec + N/fps`. `renderAudio.ts`
  renders audio offline via `OfflineAudioContext`: synth path uses new
  `scheduleScoreOffline` (scheduler.ts) — same visible/overlap logic as the
  live `scheduleScore` but passes each note's `duration` to `Instrument.start`
  (now an optional opt) instead of a `setTimeout` note-off, since a
  faster-than-realtime offline render never reaches a real timer; external-audio
  path reuses `externalAudioStartParams`. `exportMp4.ts` draws every frame with
  the same `drawFrame` onto an `OffscreenCanvas`, encodes via WebCodecs
  (`VideoEncoder`/`AudioEncoder`, H.264 High@5.1 + AAC-LC), and muxes with
  `mp4-muxer` (new dep — SPEC §3/§4 mandate it; WebCodecs itself is a native
  browser API). WebCodecs-only: throws `UnsupportedBrowserError` on unsupported
  browsers rather than falling back to MediaRecorder/WebM (that fallback is
  now BACKLOG.md #19 (Later)). `VizConfig.exportAspect` ('landscape'/'portrait',
  persisted) picks 1920×1080 vs 1080×1920 (`EXPORT_RESOLUTIONS`). ConfigPanel's
  new "Export" fieldset has the aspect selector, an Export MP4 button, and a
  progress readout; App.tsx's `handleExport` reuses the same lazy
  instrument-load path as Play, then triggers a same-tab download.
- M6 bug-fix round (2026-07-15, user testing): synth-only exports were
  totally silent — smplr's default Scheduler defers any note >~200ms ahead of
  `currentTime` to a real `setInterval`, which never fires during an
  `OfflineAudioContext` render; fixed by passing `scheduler: Scheduler(ctx,
  { lookaheadMs: Infinity })` to `Soundfont2` when `ctx instanceof
  OfflineAudioContext` (instrument.ts) so every note dispatches synchronously.
  Also: `isNoteInWindow` (mapping.ts) now takes the note's own radius so large
  dots scroll in instead of popping in at the edge; `EXPORT_RESOLUTIONS` uses
  1088 (not 1080) on the non-16:9-exact side — mod-16 dims need no H.264 crop
  metadata, which one real-world re-encode (iMessage/iCloud sync) appeared to
  mishandle, corrupting the padded edge; `handleExport` scales `pxPerSec` by
  the export/preview width ratio so exported scroll speed visually matches
  the preview; downloaded filename suffixes `_landscape`/`_portrait`.
- M5 done (2026-07-15): config sidebar (`ConfigPanel.tsx`, persisted via
  `config/storage.ts`) for track show/hide+color, bg, speed, canvas-relative
  dot scale, playhead, bar-lines/numbers/connecting-lines; lead-in/lead-out
  silence in bars (negative-second timeline); external audio (Flow 2,
  `audio/externalAudio.ts`) with a live ±1000ms offset slider; canvas
  grab-drag scrub + click-a-dot-to-seek (`timeAtX`/`findNoteAt` in
  mapping.ts); spacebar play/pause; sounding-note animation (hollow rings +
  decaying outline + playhead clone, `decayEnvelope` in mapping.ts); global
  instrument selector (`loadInstrument` exposes `instrumentNames`/
  `setInstrument`). Per-track GM instruments remain BACKLOG.md #5 (Next) —
  it has the concrete bypass plan (`sf2.presets` bank/program + smplr's
  `sf2InstrumentToPreset`).
- M4 done: `src/audio/{clock,instrument,scheduler}.ts` + Play/Pause/seek
  (rAF-driven, clock = `AudioContext.currentTime`, never Date.now). SoundFont
  `public/soundfonts/ChaosBank.sf2` (CC0, rKhive) over GPLv2 `TimGM6mb.sf2` —
  deliberate, SPEC §3 "swappable soundfont". `applyZoneGenerators`
  (instrument.ts) patches smplr's SF2→preset conversion, which ignores zone
  generators: root key (gen 58) and loop-window narrowing (gens 2/3/45/50/54) —
  without it, multi-sampled instruments mis-pitch and held notes "ghost"-repeat
  on loop wrap. Don't resurrect "parse pitch from sample name" — dead end.
- Known simplifications / traps: no devicePixelRatio scaling; per-track
  colors/visibility and external-audio offset are session-only (reset on file
  load); playback end is MIDI-driven, so an external audio file longer than
  the MIDI gets cut off; one shared instrument for all tracks (per-track GM
  is #5 above); the `/piano/i` default-instrument heuristic is file-specific;
  scheduler.ts's upfront full-piece scheduling is untested at SPEC §5's
  dense-orchestral scale; M6's bar-line/number text and line widths don't
  scale with export resolution the way dot radius does (cosmetic, not fixed).
- Next: nothing assigned — see BACKLOG.md for unscheduled work.
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build BACKLOG.md "Later" features (MusicXML, DTW alignment, OMR).
- After a plan is approved (plan mode), copy it into `plans/milestone-N-<slug>.md` before implementing.
