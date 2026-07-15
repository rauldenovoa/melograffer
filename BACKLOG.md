# Backlog — Melograffer

Work not yet assigned to a milestone. Numbered for stable cross-reference from
SPEC.md milestones and CLAUDE.md — numbers are never reused or reordered;
new items are appended with the next number, regardless of which bucket they
land in. Moved out of SPEC.md (2026-07-15) to keep the spec itself lean;
SPEC.md remains the source of truth for shipped scope, architecture, and
milestones.

*Now:*
1. Full-screen the visualization area, YouTube-style, with keyboard shortcut `F`.
2. Cap the max size of the Tracks panel so it displays ~3 tracks comfortably; more than that scrolls (e.g. the Led Zeppelin "Stairway to Heaven" fixture, which has many tracks).
3. Color distinct hands/voices within a single-track MIDI differently (e.g. Debussy's "Arabesque No. 1" fixture, which has no separate tracks per hand) — needs a voice-separation heuristic (e.g. pitch-range split or overlapping-note clustering) since there's no track/channel boundary to key off of.
20. Investigate licensing/copyright for two committed test fixtures with unclear provenance: `arabesque_1_(c)oguri.mid`/`.mp3` (Debussy's Arabesque No. 1 is public domain, but the MIDI/mp3 render itself is credited "(c) oguri" — need to confirm oguri's license/permission for reuse in this repo) and `Led Zeppelin-Stairway to Heaven-06-15-2026.mid` (downloaded from Songsterr — a user-tab-hosting site whose own MIDI/tab content has unclear redistribution rights, on top of "Stairway to Heaven" itself being under active copyright, unlike the MVP's other classical fixtures). Resolve before any public repo/release; likely outcome is removing or replacing one or both with fixtures of confirmed-clear provenance.

*Next:*
4. Visual design revamp.
5. Per-track instruments honoring each track's actual GM program number (GM = General MIDI, the standard 128-slot program-number → instrument-sound mapping, e.g. program 0 = Acoustic Grand Piano, 40 = Violin). Harder than the (now-shipped) global selector: smplr's `Soundfont2` wrapper only exposes the SF2 file's raw *instrument* names (`instrumentNames`/`loadInstrument(name)`), never the *preset* layer where GM bank/program numbers actually live. The fix isn't a name-mapping table — the `soundfont2` parser we already depend on parses `sf2.presets[i].header.{bank, preset}` correctly; the real GM address is already there, smplr's wrapper just never reads it. Approach: look up presets by bank+program ourselves, pull each preset's instrument(s), run them through the existing `applyZoneGenerators` patch plus smplr's exported `sf2InstrumentToPreset()` helper, and play them via smplr's lower-level `Sampler` class instead of its `Soundfont2` convenience wrapper — one `Sampler` per distinct program number a piece actually uses. Also needs each track's program number captured in `Score` (currently discarded in `parseMidi.ts`, though `@tonejs/midi` already parses it as `track.instrument.number`). Worth checking first whether `spessasynth_lib` (M4's original candidate, passed over for smplr) does bank/program addressing natively — could replace this bypass entirely, at the cost of re-verifying offline rendering support and pitch/loop correctness against it.
6. Multi-note-per-voice-at-once behavior (e.g. LH bass line + RH chords, or vice versa): current connecting-lines/clone logic assumes one sounding note per voice at a time; revisit how it should look when a track has simultaneous notes (chords).
7. Sounding-note clone: toggle to have it track the melody line vertically (still riding the playhead horizontally, but y-position follows whichever pitch is currently sounding) instead of the current fixed-position behavior.
8. Sounding-note outline: try flashing brighter than the dot's base color (vs. today's full-opacity-then-decay of the same color) — worth an A/B look.
9. "Organic" scroll: nonlinear (e.g. logarithmic) time-axis warp that eases around the currently-sounding note instead of constant-speed scroll.
10. Swappable/multiple soundfont support (M4 bundled `ChaosBank.sf2` for its CC0 license; a future milestone could let a different `.sf2` be swapped in/tested without re-litigating that choice).
11. Presets/themes, piece library.
12. Bar/ribbon note shapes as alternative to dots.
13. Modular visualization styles ("renderers"): support multiple pluggable viz styles beyond the current BALLS-style dots, each with its own shape/motion/color-preset behavior, user-selectable — as in Malinowski's MAM "Renderers" (musanim.com/Renderers/).
14. Harmonic coloring option (musanim.com/HarmonicColoring/).
15. SF2 volume envelope (ADSR): smplr ignores it, so notes cut off abruptly at release instead of decaying naturally — audio-quality polish, not urgent.
21. Add an About page/section giving proper credit to Stephen Malinowski and the Music Animation Machine (MAM) as the visual style's originator — SPEC.md §10 already commits to this ("Credit Malinowski by name in the app's About/README... as the originator of this visualization style"; this item is that page finally getting built). While writing it: check whether "The Well-Tempered Synth" YouTube channel and Jack Stratton credit Malinowski/MAM anywhere in their own video descriptions or channel info. A 2026-07-15 web search couldn't confirm this either way — no explicit credit language surfaced in search results or a fetch of the channel's About page (YouTube's About page doesn't reliably return full content to automated fetches) — so it needs a direct look at actual videos/descriptions, not another search.

*Later:*
16. MusicXML input (easy add; do after MVP proves the pipeline).
17. Real-recording alignment: separate offline Python tool (synctoolbox/librosa DTW → tempo map → warped MIDI that this app consumes unchanged). Do NOT build into the web app.
18. PDF/scanned score input (OMR — Audiveris or similar; unreliable, evaluate later).
19. WebM/MediaRecorder fallback for the MP4 exporter, for browsers without WebCodecs H.264+AAC support (M6 shipped WebCodecs-only, Chrome/Edge; SPEC §5 already accepts this for a personal tool).
