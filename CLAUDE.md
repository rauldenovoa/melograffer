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
- Milestone 7 (website/app UI design revamp) DONE (2026-07-15). Next: M8
  (housekeeping & quick UI wins) — see SPEC.md §6 for M8-M14, BACKLOG.md for
  unscheduled ("Later") work. Per-milestone implementation detail lives in
  `plans/milestone-N-*.md` and git history, not here.
- Traps (not obvious from reading the code):
  - `<fieldset>`'s implicit `min-width: min-content` ignores flex/grid
    ancestors; CSS Grid items have the same default independently. Both need
    explicit `min-width: 0` or one long unbreakable string (e.g. a track
    name) blows the layout into horizontal scroll.
  - Don't retry mod-16 export dimensions (1920×1088 etc.) without real
    evidence — tried once for a reported MP4 corruption bug, reverted; root
    cause still open (see M6 plan).
  - smplr's default Scheduler defers notes to a real `setInterval`, which
    never fires in `OfflineAudioContext`; `loadInstrument` must pass
    `Scheduler(ctx, { lookaheadMs: Infinity })` for offline (export) contexts.
  - `applyZoneGenerators` (instrument.ts) patches smplr's SF2→preset
    conversion for root key + loop-window narrowing — without it,
    multi-sampled instruments mis-pitch and held notes ghost-repeat on loop
    wrap. Don't resurrect "parse pitch from sample name" — dead end.
  - `ChaosBank.sf2` (CC0) was deliberately chosen over GPLv2 `TimGM6mb.sf2` —
    SPEC §3 requires a swappable, permissively licensed soundfont.
- Known simplifications: no devicePixelRatio scaling; per-track colors/
  visibility and external-audio offset are session-only; playback end is
  MIDI-driven (external audio longer than the MIDI gets cut off); one shared
  instrument for all tracks (per-track GM is BACKLOG #5, Next); export
  bar-line/number text and line widths don't scale with resolution.
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build BACKLOG.md "Later" features (MusicXML, DTW alignment, OMR).
- After a plan is approved (plan mode), copy it into `plans/milestone-N-<slug>.md` before implementing.
