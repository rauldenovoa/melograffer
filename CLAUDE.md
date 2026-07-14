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
- Milestone: 3 — Canvas renderer (see SPEC.md §6) — DONE
- Done: `src/types.ts` (+`VizConfig`); `src/render/mapping.ts` (pure pitch/duration/x/
  window math, pitch range auto-fits per score); `src/render/drawFrame.ts` (pure
  `drawFrame`, `CanvasLike2D` structural interface, halo-then-dot draw order);
  `src/render/defaultConfig.ts`; canvas + time-slider scrub UI in `App.tsx`; fixture
  `fixtures/bach_sinfonia.mid` added (Mutopia Project, public domain — Bach Sinfonia
  No. 1, BWV 787, three-voice, for density/culling tests).
- Known simplifications (not bugs, revisit if they become issues): fixed preview
  canvas size, no devicePixelRatio scaling; `VizConfig.colors` (SPEC §4) omitted —
  superseded by `Track.color`; no config UI yet (M5).
- Next: Milestone 4 — Audio playback + live sync
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build "Out (later)" features (MusicXML, DTW alignment, OMR).
