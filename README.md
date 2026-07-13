# Melograffer

A client-only web app that turns a MIDI score into a smalin-style scrolling music
visualization — one colored line of dots per instrument/voice, dot size proportional to
note duration, vertical position by pitch — synced to audio, playable live in the browser,
and exportable as an MP4 video.

See `SPEC.md` for the full spec and `CLAUDE.md` for working conventions.

## Stack

Vite · React 18 · TypeScript (strict) · Canvas 2D · `@tonejs/midi` · WebCodecs + `mp4-muxer`
· deployed as a static site on Vercel.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # vitest
npm run lint        # eslint
npx tsc --noEmit    # typecheck
npm run build       # production build
```

## Attribution

Direct inspiration: Stephen Malinowski's **Music Animation Machine (MAM)**, specifically the
"BALLS" (part motion) visualization style from the free MAM Player (musanim.com/Player/).
This project is an independent reimplementation of that documented visual concept (pitch =
vertical position, duration = size, scrolling colored lines per voice) using a different,
modern web stack — no MAM code, assets, or binaries are used or referenced at runtime.
