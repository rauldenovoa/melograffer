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
- Milestone: 4 — Audio playback + live sync (see SPEC.md §6) — DONE
- Done: `src/audio/clock.ts` (`PlaybackClock`, injectable clock, never Date.now/
  performance.now); `src/audio/instrument.ts` (wraps `smplr`'s `Soundfont2` +
  `soundfont2`'s raw-SF2 parser behind our own `Instrument` interface, mirroring
  `CanvasLike2D`'s structural-interface pattern); `src/audio/scheduler.ts` (schedules
  visible-track notes from `Score` directly — no second MIDI parse, so audio can't
  drift from visuals); Play/Pause/seek wired into `App.tsx`, driving `timeSec` via
  rAF while playing. SoundFont asset `public/soundfonts/ChaosBank.sf2` (~11.5MB,
  CC0 1.0, rKhive) chosen over the smaller `TimGM6mb.sf2` (GPLv2) specifically to
  avoid copyleft entanglement if this repo ever goes public — deliberate call, see
  SPEC §3's new "swappable soundfont" Out-later item. Fixture `fixtures/fur_elise.mid`
  added (Beethoven WoO 59, Mutopia, public domain, ~3min) for the SPEC §8 drift check.
  Offline-render smoke-tested live via `smplr`'s `renderOffline` — de-risks M6.
- Known simplifications: fixed preview canvas size, no devicePixelRatio scaling;
  `VizConfig.colors` (SPEC §4) omitted — superseded by `Track.color`; no config UI
  yet (M5); one shared instrument sound for all tracks (no per-track GM program).
- **Known bug, shipped anyway (user's call, 2026-07-14):** multi-sampled piano
  zones play wrong notes/octaves. Root cause confirmed in `soundfont2` npm lib:
  it clamps any raw `originalPitch` byte outside 0-127 to 60, and every piano
  zone in ChaosBank.sf2 — and in every other community SF2 tested (TimGM6mb,
  Masterpiece, Jnsgm2, Unison) — reads as invalid, so all zones think they were
  recorded at middle C. Fix path (not built): each affected sample's
  `header.name` spells out its real pitch ("Piano C#8") — parse that instead of
  trusting `originalPitch`. Revisit before relying on pitch correctness.
- Next: Milestone 5 — Config UI + external audio
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build "Out (later)" features (MusicXML, DTW alignment, OMR).
