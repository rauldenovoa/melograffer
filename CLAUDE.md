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
- Milestone: 7 — website/app UI design revamp (see SPEC.md §6) — DONE (2026-07-15)
- M7 done: app-chrome-only redesign (canvas rendering itself is M13, untouched).
  Dark jewel-tone theme — accent colors (`--accent` #1c6baf, `--accent-green`
  #006e48) sampled directly from `public/images/melograffer_logo_color.png`
  pixels, not guessed. New `:root` token layer + self-hosted variable-woff2
  `@font-face` (Fraunces display / Inter UI, vendored to `public/fonts/`, no
  CDN) in `src/index.css`. `App.tsx` restructured into a product shell (app
  bar with file actions, sidebar cards, canvas-frame with a real drag-drop
  empty state reusing the existing MIDI-parse path, transport bar with a new
  `formatTime` mm:ss readout) — all existing aria-labels/roles/button text
  preserved, all 108 tests pass unchanged. `App.css` fully rewritten
  (`.btn`/`.btn-primary`/`.btn-ghost`, themed native controls). Found and
  fixed during verification: `<fieldset>`'s implicit `min-width: min-content`
  (a UA-stylesheet default that ignores flex/grid ancestors) blew out the
  sidebar and caused page-wide horizontal scroll on any long track name —
  needs an explicit `min-width: 0` on the fieldset itself; the same fix is
  also applied at the `.workspace` grid-item level since CSS Grid has the
  identical default-min-width blowout risk independently of the fieldset one.
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
  (`VideoEncoder`/`AudioEncoder`, H.264 High@4.2 + AAC-LC), and muxes with
  `mp4-muxer` (new dep — SPEC §3/§4 mandate it; WebCodecs itself is a native
  browser API). WebCodecs-only: throws `UnsupportedBrowserError` on unsupported
  browsers rather than falling back to MediaRecorder/WebM (that fallback is
  now BACKLOG.md #19 (Later)). `VizConfig.exportAspect` ('landscape'/'portrait',
  persisted) picks 1920×1080 vs 1080×1920 (`EXPORT_RESOLUTIONS`). ConfigPanel's
  new "Export" fieldset has the aspect selector, an Export MP4 button, and a
  progress readout; App.tsx's `handleExport` reuses the same lazy
  instrument-load path as Play, then triggers a same-tab download.
- M6 bug-fix round (2026-07-15, user testing): synth-only exports were
  totally silent — smplr's default Scheduler defers notes >~200ms ahead of
  `currentTime` to a real `setInterval`, which never fires during an
  `OfflineAudioContext` render. Fixed: `loadInstrument` passes `scheduler:
  Scheduler(ctx, { lookaheadMs: Infinity })` when `ctx instanceof
  OfflineAudioContext`. Also fixed: `isNoteInWindow` (mapping.ts) now takes
  the note's own radius so large dots scroll in instead of popping in;
  `handleExport` scales `pxPerSec` by the export/preview width ratio;
  filename suffixes `_landscape`/`_portrait`. **Tried and reverted:**
  1920x1088/1088x1920 (mod-16, no H.264 crop needed) to fix a reported
  iMessage/iCloud-sync corruption artifact — reverted because iPhones record
  their own 1080p (also not ÷16) through that same pipeline fine daily, so
  the theory was likely wrong, and the 0.7% aspect deviation risked real
  letterboxing on strict-ratio uploads (Instagram). Don't retry mod-16
  dimensions without real evidence it's the cause. Root cause still open;
  codec level dropped 5.1→4.2 (standard for 1080p60, not 4K) as a
  defensible-but-unconfirmed adjustment instead.
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
- Next: M8 (housekeeping & quick UI wins) — see SPEC.md §6 for M8-M14, BACKLOG.md for unscheduled ("Later") work.
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build BACKLOG.md "Later" features (MusicXML, DTW alignment, OMR).
- After a plan is approved (plan mode), copy it into `plans/milestone-N-<slug>.md` before implementing.
