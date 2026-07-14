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
- Done: `src/audio/{clock,instrument,scheduler}.ts` + Play/Pause/seek in `App.tsx`
  (rAF-driven `timeSec`, never Date.now/performance.now). Audio schedules notes
  straight from `Score` (no second MIDI parse). SoundFont `public/soundfonts/
  ChaosBank.sf2` (CC0 1.0, rKhive) over GPLv2 `TimGM6mb.sf2` — deliberate,
  see SPEC §3 "swappable soundfont". Fixture `fixtures/fur_elise.mid` added
  for the §8 drift check. Offline-render smoke-tested — de-risks M6.
- Pitch bug RESOLVED (2026-07-14): SF2 sample headers legitimately leave
  originalPitch unset (255 → spec's 60 fallback); real root key is in zone
  generator 58 (`OverridingRootKey`), which smplr's SF2→preset conversion
  ignored, so multi-sampled zones played as if recorded at middle C. Fixed by
  `applyOverridingRootKeys` (instrument.ts); verified spectrally. Don't
  resurrect the "parse pitch from sample name" idea — dead end, checked.
- Known simplifications / traps: no devicePixelRatio scaling; no config UI
  (M5) — `SCROLL_OFF_BUFFER_SEC` (App.tsx) bakes in `pxPerSec`, must recompute
  once editable; one shared instrument for all tracks — smplr also drops
  velRange/envelope/tuning generators (only gen 58 patched), so per-track GM
  instruments may hit layered patches; the `/piano/i` instrument-name
  heuristic is file-specific (GeneralUser.sf2 has no "piano" name at all —
  smplr reads low-level instrument names, not presets); scheduler.ts's
  upfront full-piece scheduling is untested at SPEC §5's dense-orchestral
  scale; M6's exporter needs explicit note durations — scheduler.ts's
  setTimeout note-offs never fire in a faster-than-realtime offline render.
- Next: Milestone 5 — Config UI + external audio
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build "Out (later)" features (MusicXML, DTW alignment, OMR).
