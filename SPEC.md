# SPEC — Melograffer (v0.1, 2026-07-12)

## 1. One-paragraph pitch
A client-only web app that turns a MIDI score into a smalin-style scrolling music visualization — one colored line of dots per instrument/voice, dot size proportional to note duration, vertical position by pitch — perfectly synced to audio, playable live in the browser and exportable as an MP4 video. Reference aesthetic: YouTube channel "The Well-Tempered Synth" (itself descended from Stephen Malinowski's Music Animation Machine).

## 2. Users & core flows
- Primary user: the developer (Raúl), producing visualization videos of classical/synth pieces. No other users, no accounts.
- Flow 1 — Visualize: drop a `.mid` file → tracks auto-detected → pick tracks + colors → press play → scrolling visualization with synthesized audio.
- Flow 2 — External audio: additionally drop an audio file (mp3/wav) rendered from the *same* MIDI (e.g., in Logic/GarageBand) → app plays that audio instead of the built-in synth; visuals follow MIDI timing (sync is exact because both share the timing source).
- Flow 3 — Export: press Export → deterministic offline render → download `.mp4` (H.264 + AAC).

## 3. Scope
**In (MVP):**
- MIDI (.mid) parsing → note events per track: {startSec, durationSec, midiNote, velocity, trackId}
- Canvas 2D scrolling renderer: fixed playhead (center or ~1/3 from left), notes scroll right→left; y = MIDI note number (log-frequency, like a staff); dot radius = k·√duration by default (option: linear, capped); active notes highlighted (brighter/halo)
- Track selection (include/exclude), per-track color, background color, scroll speed (px/sec), dot-size scale — all in a config sidebar, persisted in URL params or localStorage
- Audio A: built-in SoundFont synthesis of the MIDI (play/pause/seek)
- Audio B: user-supplied audio file with a manual offset slider (±ms) for fine alignment
- MP4 export: offline frame-by-frame render via WebCodecs → mux with `mp4-muxer`; audio track from OfflineAudioContext render (Audio A) or the uploaded file (Audio B). Deterministic: frame N drawn at exactly N/fps seconds — never screen capture.
- 1080p/60fps export target; canvas preview can be lower res

**Out (later):**
- MusicXML input (easy add; do after MVP proves the pipeline)
- Real-recording alignment: separate offline Python tool (synctoolbox/librosa DTW → tempo map → warped MIDI that this app consumes unchanged). Do NOT build into the web app.
- PDF/scanned score input (OMR — Audiveris or similar; unreliable, evaluate later)
- Bar/ribbon note shapes as alternative to dots; connecting lines between consecutive notes of a voice
- Presets/themes, piece library

**Never:**
- No auth, no database, no server-side rendering, no Supabase. Static site only.
- No YouTube audio downloading (ToS violation) — user supplies audio files.
- No timeline/note editing (this is a visualizer, not a DAW).

## 4. Architecture
- Stack: Vite + React 18 + TypeScript (strict) + Canvas 2D · deployed as static site on Vercel
- Key libraries: `@tonejs/midi` (parsing); SoundFont synth — candidate `spessasynth_lib` (verify it supports OfflineAudioContext rendering in M4; fallback `smplr` or `js-synthesizer`); `mp4-muxer` + WebCodecs (export)
- Data model (in-memory only): `Score { tracks: Track[] }`, `Track { id, name, notes: Note[], color, visible }`, `Note { startSec, durationSec, midiNote, velocity }`, `VizConfig { colors, bg, pxPerSec, dotScale, radiusMode, playheadX }`
- Rendering: single `drawFrame(ctx, score, config, timeSec)` pure function — used identically by the live player (requestAnimationFrame, clock = AudioContext.currentTime) and the exporter (fixed timestep). This one function being pure is the core architectural invariant.
- Auth: none. Third-party APIs: none. Costs: Vercel free tier.
- Rejected alternatives:
  - Remotion (React → video): elegant Player+render duality, but MP4 rendering requires local Node/CLI, splitting the tool in two; WebCodecs keeps everything in one deployed page.
  - Python offline pipeline (pretty_midi + matplotlib + moviepy): simplest possible for personal use, but no live interactivity/config UI, which is half the value.
  - Next.js + Supabase (default stack): no server state exists to justify it.

## 5. Risks & open questions (from blindspot review)
| Risk / assumption | Severity | Mitigation / verification step |
|---|---|---|
| WebCodecs MP4 export is Chrome/Edge-only | M | Accepted (personal tool). Fallback: realtime MediaRecorder → WebM. Verify AAC AudioEncoder support early in M6. |
| SoundFont synth may not support offline (faster-than-realtime) audio render | M | Verify in M4 before committing; fallback: render audio in realtime once to a buffer, or rely on Flow 2 (external audio). |
| Radius ∝ duration makes long notes into blobs (area grows r²) | L | Default √duration + max cap; both modes configurable; judge visually. |
| GM SoundFont audio sounds cheap vs. reference channel | M | Flow 2 (external audio rendered from same MIDI) is the quality path; built-in synth is for preview. |
| Real-recording sync assumed "later but doable" | H | It is a separate DTW problem (synctoolbox). Keep contract: alignment tool outputs warped MIDI; web app never changes. |
| Dense orchestral MIDIs → thousands of dots, canvas perf | L | Cull off-screen notes; only draw visible time window. Test with a Beethoven symphony MIDI in M3. |

## 6. Milestones & model routing
| # | Milestone | Definition of done | Model |
|---|---|---|---|
| 1 | Scaffold: Vite+React+TS, Vercel deploy green | App deploys; placeholder page loads | opusplan |
| 2 | MIDI ingest + data model | Drop .mid → track list with names/note counts rendered; unit tests on 2 sample MIDIs | opusplan |
| 3 | Canvas renderer (static + scrub) | `drawFrame` pure fn; time slider scrubs the score; pitch/duration/color mapping correct; 60fps with 5k+ notes | opusplan |
| 4 | Audio playback + live sync | Play/pause/seek with SoundFont synth; drift < 1 frame over 3 min (clock = AudioContext.currentTime) | opusplan |
| 5 | Config UI + external audio | Track toggles, colors, bg, speed, dot scale; audio file upload + offset slider; settings persist | opusplan |
| 6 | MP4 export | Downloadable 1080p60 H.264+AAC MP4; A/V sync verified vs. live playback | opusplan |
| — | Bulk/mechanical passes (lint, renames) | — | haiku |
| — | Escalation: stuck >2 attempts, root-cause unclear (likely M4 clock or M6 muxing) | — | fable |

## 7. Environment & secrets
None. No env vars, no API keys. Vercel project linked to the GitHub repo.

## 8. Verification
- M2: vitest unit tests parsing `fixtures/bach_invention.mid` and `fixtures/multitrack.mid` (commit small public-domain MIDIs to `fixtures/`).
- M3: visual check — scrub through fixture; confirm a half note's dot area ≈ 2× a quarter note's; higher pitch renders higher.
- M4: play 3-minute fixture; final note's visual onset within one frame of its audible onset (record screen, step frames).
- M6: export fixture, open MP4 in QuickTime/VLC; compare a late-piece note's A/V sync against live playback; file plays on iPhone (H.264 baseline check).

## 9. Optional visual reference (not a build dependency)
Stephen Malinowski's free "Music Animation Machine Player" (musanim.com/Player/, Windows-only) has a built-in style ("BALLS"/part motion) close to this project's target look. Not required for any milestone, but useful during M3 (renderer tuning) to eyeball dot sizing/spacing against a mature reference implementation. Run via Wine (`brew install --cask wine-stable`, clear Gatekeeper quarantine with `xattr -dr com.apple.quarantine`) or a Windows VM (UTM/Parallels) on Mac — never decompile or reverse-engineer the binary; only compare rendered output.

## 10. Attribution
Direct inspiration: Stephen Malinowski's **Music Animation Machine (MAM)**, specifically the "BALLS" (part motion) visualization style from the free MAM Player (musanim.com/Player/). This project is an independent reimplementation of that documented visual concept (pitch = vertical position, duration = size, scrolling colored lines per voice) using a different, modern web stack — no MAM code, assets, or binaries are used or referenced at runtime. Credit Malinowski by name in the app's About/README and in any published output (e.g., video descriptions), as the originator of this visualization style.

Name origin: "Melograffer" references the **Melograph**, an analysis device invented by musicologist Charles Seeger in the 1950s to plot pitch/loudness of *recorded performances* as continuous graphs, bypassing the cultural assumptions built into Western staff notation. This project runs the same instinct in the opposite direction — visualizing a *symbolic score* (MIDI) rather than analyzing raw audio — so it's a mirror image of the Melograph's purpose, not a direct descendant. Worth a name/trademark spot-check before any public launch; informal search turned up no conflicting "Melograffer" (that spelling) in use.
