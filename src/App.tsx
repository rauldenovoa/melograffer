import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import { drawFrame } from './render/drawFrame'
import { scoreDurationSec } from './render/mapping'
import { loadInstrument, type Instrument } from './audio/instrument'
import { PlaybackClock } from './audio/clock'
import { scheduleScore, stopAll } from './audio/scheduler'
import { loadVizConfig, saveVizConfig } from './config/storage'
import { ConfigPanel, type TrackPatch } from './ConfigPanel'
import type { Score } from './types'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 360

function App() {
  const [score, setScore] = useState<Score | null>(null)
  const [config, setConfig] = useState(() => loadVizConfig())
  const [timeSec, setTimeSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const clockRef = useRef<PlaybackClock | null>(null)
  const instrumentRef = useRef<Instrument | null>(null)
  const activeStopFnsRef = useRef<Array<() => void>>([])
  const rafRef = useRef<number | null>(null)

  const duration = useMemo(() => (score ? scoreDurationSec(score) : 0), [score])
  // Extra time after the last note so its dot scrolls fully off-screen instead
  // of freezing mid-flight. Derived from the live config: scroll speed is
  // editable now, so this can't be a module constant.
  const playbackEndSec = duration + CANVAS_WIDTH / config.pxPerSec
  // The rAF loop's closure goes stale across re-renders; it reads the current
  // end time through this ref instead.
  const playbackEndRef = useRef(playbackEndSec)
  playbackEndRef.current = playbackEndSec

  useEffect(() => {
    saveVizConfig(config)
  }, [config])

  function stopSound() {
    stopAll(activeStopFnsRef.current)
    activeStopFnsRef.current = []
  }

  function stopPlayback() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    stopSound()
    clockRef.current?.pause()
    setIsPlaying(false)
  }

  function runLoop() {
    const clock = clockRef.current
    if (!clock) return
    const t = clock.getCurrentTimeSec()
    if (t >= playbackEndRef.current) {
      stopPlayback()
      setTimeSec(playbackEndRef.current)
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
    activeStopFnsRef.current = scheduleScore(instrumentRef.current, score, timeSec, ctx.currentTime)
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(runLoop)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = Number(e.target.value)
    setTimeSec(newTime)
    stopSound()

    const ctx = audioCtxRef.current
    const clock = clockRef.current
    const instrument = instrumentRef.current
    if (isPlaying && ctx && clock && instrument && score) {
      clock.seek(newTime)
      activeStopFnsRef.current = scheduleScore(instrument, score, newTime, ctx.currentTime)
    }
  }

  function handleTrackChange(trackId: string, patch: TrackPatch) {
    if (!score) return
    const next: Score = {
      ...score,
      tracks: score.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }
    setScore(next)

    // Muting/unmuting a track mid-playback must be audible immediately, so
    // reschedule from the current position (color changes are visual-only).
    const ctx = audioCtxRef.current
    const clock = clockRef.current
    const instrument = instrumentRef.current
    if ('visible' in patch && isPlaying && ctx && clock && instrument) {
      stopSound()
      activeStopFnsRef.current = scheduleScore(instrument, next, clock.getCurrentTimeSec(), ctx.currentTime)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    stopPlayback()
    const buffer = await file.arrayBuffer()
    setScore(parseMidi(buffer))
    setTimeSec(0)
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !score) return
    drawFrame(ctx, score, config, timeSec)
  }, [score, config, timeSec])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      stopSound()
      audioCtxRef.current?.close()
    }
  }, [])

  return (
    <main className="app">
      <h1>Melograffer</h1>
      <div className="layout">
        <ConfigPanel
          config={config}
          onConfigChange={setConfig}
          score={score}
          onTrackChange={handleTrackChange}
        />
        <div className="stage">
          <p>Drop a MIDI file to see its tracks.</p>
          <input type="file" accept=".mid,.midi" onChange={handleFileChange} />
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
          <div>
            <button onClick={handlePlayPause} disabled={!score || isLoadingAudio}>
              {isLoadingAudio ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <input
            type="range"
            className="scrub"
            aria-label="Playback position"
            min={0}
            max={playbackEndSec}
            step={0.01}
            value={Math.min(timeSec, playbackEndSec)}
            disabled={!score}
            onChange={handleSeek}
          />
        </div>
      </div>
    </main>
  )
}

export default App
