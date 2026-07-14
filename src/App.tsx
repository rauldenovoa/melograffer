import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import { drawFrame } from './render/drawFrame'
import { DEFAULT_VIZ_CONFIG } from './render/defaultConfig'
import { scoreDurationSec } from './render/mapping'
import { loadInstrument, type Instrument } from './audio/instrument'
import { PlaybackClock } from './audio/clock'
import { scheduleScore, stopAll } from './audio/scheduler'
import type { Score } from './types'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 360

function App() {
  const [score, setScore] = useState<Score | null>(null)
  const [timeSec, setTimeSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const clockRef = useRef<PlaybackClock | null>(null)
  const instrumentRef = useRef<Instrument | null>(null)
  const rafRef = useRef<number | null>(null)

  const duration = useMemo(() => (score ? scoreDurationSec(score) : 0), [score])

  function stopPlayback() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (instrumentRef.current) stopAll(instrumentRef.current)
    clockRef.current?.pause()
    setIsPlaying(false)
  }

  function runLoop() {
    const clock = clockRef.current
    if (!clock) return
    const t = clock.getCurrentTimeSec()
    if (t >= duration) {
      stopPlayback()
      setTimeSec(duration)
      return
    }
    setTimeSec(t)
    rafRef.current = requestAnimationFrame(runLoop)
  }

  async function handlePlayPause() {
    if (isPlaying) {
      stopPlayback()
      return
    }
    if (!score) return

    let ctx = audioCtxRef.current
    if (!ctx) {
      ctx = new AudioContext()
      audioCtxRef.current = ctx
      clockRef.current = new PlaybackClock(() => ctx!.currentTime)
    }
    await ctx.resume()

    if (!instrumentRef.current) {
      setIsLoadingAudio(true)
      instrumentRef.current = await loadInstrument(ctx)
      setIsLoadingAudio(false)
    }

    const clock = clockRef.current!
    clock.play(timeSec)
    scheduleScore(instrumentRef.current, score, timeSec, ctx.currentTime)
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(runLoop)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = Number(e.target.value)
    setTimeSec(newTime)

    const ctx = audioCtxRef.current
    const clock = clockRef.current
    const instrument = instrumentRef.current
    if (isPlaying && ctx && clock && instrument && score) {
      stopAll(instrument)
      clock.seek(newTime)
      scheduleScore(instrument, score, newTime, ctx.currentTime)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (isPlaying) stopPlayback()
    const buffer = await file.arrayBuffer()
    setScore(parseMidi(buffer))
    setTimeSec(0)
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !score) return
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, timeSec)
  }, [score, timeSec])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (instrumentRef.current) stopAll(instrumentRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  return (
    <main className="app">
      <h1>Melograffer</h1>
      <p>Drop a MIDI file to see its tracks.</p>
      <input type="file" accept=".mid,.midi" onChange={handleFileChange} />
      {score && (
        <ul>
          {score.tracks.map((track) => (
            <li key={track.id}>
              {track.name} — {track.notes.length} notes
            </li>
          ))}
        </ul>
      )}
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <div>
        <button onClick={handlePlayPause} disabled={!score || isLoadingAudio}>
          {isLoadingAudio ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>
      <input
        type="range"
        aria-label="Playback position"
        min={0}
        max={duration}
        step={0.01}
        value={timeSec}
        disabled={!score}
        onChange={handleSeek}
      />
    </main>
  )
}

export default App
