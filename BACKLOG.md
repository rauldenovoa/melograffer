# Backlog — Melograffer

Every item below is grouped under the milestone it's slated for (SPEC.md §6
is the source of truth for milestone scope/DoD; this file holds the item-level
detail). Numbers are stable cross-references — SPEC.md's milestone table and
CLAUDE.md cite them as `BACKLOG #N` — and are not reused once assigned.
Renumbered 2026-07-15 to read chronologically within each milestone (old
numbers were assignment order, not milestone order, and had drifted out of
sync with the grouping); update SPEC.md/CLAUDE.md citations together with any
future renumbering.

| Milestone | Status |
|---|---|
| [M7 — Website/app UI design revamp](#m7--websiteapp-ui-design-revamp) | Done |
| [M8 — Housekeeping & quick UI wins](#m8--housekeeping--quick-ui-wins) | Next |
| [M9 — Export UX polish](#m9--export-ux-polish) | Planned |
| [M10 — Voice separation & chord mapping](#m10--voice-separation--chord-mapping) | Planned |
| [M11 — Sounding-note animation polish](#m11--sounding-note-animation-polish) | Planned |
| [M12 — Audio quality](#m12--audio-quality) | Planned |
| [M13 — Visualization styles & design revamp](#m13--visualization-styles--design-revamp) | Planned |
| [M14 — Presets & library](#m14--presets--library) | Planned |
| [Later — unscheduled](#later--unscheduled) | Backlog |

## M7 — Website/app UI design revamp

1. Color-palette reference for the app-chrome design revamp (and usable for M13's canvas theming too) — scraped 2026-07-15 from https://www.threads.com/@346eur/post/DUu44Ewguvx: Hot Fuchsia `#F8395A` / Icy Blue `#B3D1ED`; Lavender Blush `#F6E3E5` / French Blue `#213F95`; Lilac `#CBA2C9` / Cream `#FEFBCE`. (Elegant/muted pastel-vs-deep-accent pairings — matches the "classy, not flashy" brief; the post's carousel had more swatches than this environment could scroll through without logging in — worth a fuller look with a real account before committing to one.) *Superseded during implementation by colors pixel-sampled from the shipped logo artwork — kept here as a record of the input, not the final choice.*
2. "Premium site" design-brief prompts, scraped 2026-07-15 from https://www.threads.com/@aicreatorco/post/DavtWCclaIn (a generic growth-marketing prompt-pack thread — mixed signal, but a few angles are genuinely reusable framing for the M7 brief): typography pairing + spacing rules + "micro-details that separate premium from template"; above-the-fold layout + "scroll story" from headline to CTA + identify the one element to remove; concrete social-proof placement. Used as a self-review checklist for M7's output, not literal prompts to paste.

## M8 — Housekeeping & quick UI wins

3. Full-screen the visualization area, YouTube-style, with keyboard shortcut `F`.
4. Cap the max size of the Tracks panel so it displays ~3 tracks comfortably; more than that scrolls (e.g. the Led Zeppelin "Stairway to Heaven" fixture, which has many tracks).
5. Investigate licensing/copyright for two committed test fixtures with unclear provenance: `arabesque_1_(c)oguri.mid`/`.mp3` (Debussy's Arabesque No. 1 is public domain, but the MIDI/mp3 render itself is credited "(c) oguri" — need to confirm oguri's license/permission for reuse in this repo) and `Led Zeppelin-Stairway to Heaven-06-15-2026.mid` (downloaded from Songsterr — a user-tab-hosting site whose own MIDI/tab content has unclear redistribution rights, on top of "Stairway to Heaven" itself being under active copyright, unlike the MVP's other classical fixtures). Resolve before any public repo/release; likely outcome is removing or replacing one or both with fixtures of confirmed-clear provenance.
6. Add an About page/section giving proper credit to Stephen Malinowski and the Music Animation Machine (MAM) as the visual style's originator — SPEC.md §10 already commits to this ("Credit Malinowski by name in the app's About/README... as the originator of this visualization style"; this item is that page finally getting built). While writing it: check whether "The Well-Tempered Synth" YouTube channel and Jack Stratton credit Malinowski/MAM anywhere in their own video descriptions or channel info. A 2026-07-15 web search couldn't confirm this either way — no explicit credit language surfaced in search results or a fetch of the channel's About page (YouTube's About page doesn't reliably return full content to automated fetches) — so it needs a direct look at actual videos/descriptions, not another search.
7. Loading a new MIDI file while an external audio file is already loaded leaves the stale audio attached: playing back after the MIDI swap still sounds the *original* audio file instead of following the new MIDI. Loading a new MIDI should reset/clear any loaded external audio (same as clicking "Remove").

## M9 — Export UX polish

8. Preview the export before download: some way to watch/scrub the rendered video (or a fast preview-quality pass) before committing to the full encode+download, so a bad take doesn't cost a full export cycle.
9. Long unexplained delay between pressing Export and the browser's Save-As dialog appearing. Investigate where the time actually goes (instrument/soundfont load, offline audio render, encoder warm-up, first-frame draw) and see if any of it can be parallelized, streamed, or shown as progress instead of a silent wait.

## M10 — Voice separation & chord mapping

10. Color distinct hands/voices within a single-track MIDI differently (e.g. Debussy's "Arabesque No. 1" fixture, which has no separate tracks per hand) — needs a voice-separation heuristic (e.g. pitch-range split or overlapping-note clustering) since there's no track/channel boundary to key off of.
11. Multi-note-per-voice-at-once behavior (e.g. LH bass line + RH chords, or vice versa): current connecting-lines/clone logic assumes one sounding note per voice at a time; revisit how it should look when a track has simultaneous notes (chords).

## M11 — Sounding-note animation polish

12. Sounding-note clone: toggle to have it track the melody line vertically (still riding the playhead horizontally, but y-position follows whichever pitch is currently sounding) instead of the current fixed-position behavior.
13. Sounding-note outline: try flashing brighter than the dot's base color (vs. today's full-opacity-then-decay of the same color) — worth an A/B look.
14. "Organic" scroll: nonlinear (e.g. logarithmic) time-axis warp that eases around the currently-sounding note instead of constant-speed scroll.

## M12 — Audio quality

15. Per-track instruments honoring each track's actual GM program number (GM = General MIDI, the standard 128-slot program-number → instrument-sound mapping, e.g. program 0 = Acoustic Grand Piano, 40 = Violin). Harder than the (now-shipped) global selector: smplr's `Soundfont2` wrapper only exposes the SF2 file's raw *instrument* names (`instrumentNames`/`loadInstrument(name)`), never the *preset* layer where GM bank/program numbers actually live. The fix isn't a name-mapping table — the `soundfont2` parser we already depend on parses `sf2.presets[i].header.{bank, preset}` correctly; the real GM address is already there, smplr's wrapper just never reads it. Approach: look up presets by bank+program ourselves, pull each preset's instrument(s), run them through the existing `applyZoneGenerators` patch plus smplr's exported `sf2InstrumentToPreset()` helper, and play them via smplr's lower-level `Sampler` class instead of its `Soundfont2` convenience wrapper — one `Sampler` per distinct program number a piece actually uses. Also needs each track's program number captured in `Score` (currently discarded in `parseMidi.ts`, though `@tonejs/midi` already parses it as `track.instrument.number`). Worth checking first whether `spessasynth_lib` (M4's original candidate, passed over for smplr) does bank/program addressing natively — could replace this bypass entirely, at the cost of re-verifying offline rendering support and pitch/loop correctness against it.
16. Swappable/multiple soundfont support (M4 bundled `ChaosBank.sf2` for its CC0 license; a future milestone could let a different `.sf2` be swapped in/tested without re-litigating that choice).
17. SF2 volume envelope (ADSR): smplr ignores it, so notes cut off abruptly at release instead of decaying naturally — audio-quality polish, not urgent.
18. Investigate why GarageBand's own MIDI playback (tested with its Steinway Grand Piano patch) sounds dramatically better than our SoundFont synth — understand what's actually different (sample quality/multi-velocity layering, release samples, convolution/reverb, EQ/compression on the output bus, etc.) before deciding whether any of it is realistically replicable with an SF2-based synth vs. being an inherent ceiling of the format (relates to #16 swappable soundfont, #17 ADSR envelopes).

## M13 — Visualization styles & design revamp

19. Visual design revamp of the canvas visualization's own rendering styles (distinct from M7, which is the page/chrome around it).
20. Bar/ribbon note shapes as alternative to dots.
21. Modular visualization styles ("renderers"): support multiple pluggable viz styles beyond the current BALLS-style dots, each with its own shape/motion/color-preset behavior, user-selectable — as in Malinowski's MAM "Renderers" (musanim.com/Renderers/).
22. Harmonic coloring option (musanim.com/HarmonicColoring/).
23. Run Malinowski's MAMPlayer.exe (SPEC §9 already documents the Wine setup: `brew install --cask wine-stable`, clear quarantine, never decompile) side-by-side with our renderer on a shared fixture and note concretely what's worth replicating (motion feel, timing, color/shape choices) vs. what we've already deliberately diverged from.

## M14 — Presets & library

24. Presets/themes, piece library.

## Later — unscheduled

25. MusicXML input (easy add; do after MVP proves the pipeline).
26. Real-recording alignment: separate offline Python tool (synctoolbox/librosa DTW → tempo map → warped MIDI that this app consumes unchanged). Do NOT build into the web app.
27. PDF/scanned score input (OMR — Audiveris or similar; unreliable, evaluate later).
28. WebM/MediaRecorder fallback for the MP4 exporter, for browsers without WebCodecs H.264+AAC support (M6 shipped WebCodecs-only, Chrome/Edge; SPEC §5 already accepts this for a personal tool).
