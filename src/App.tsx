import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import { drawFrame } from './render/drawFrame'
import { scoreDurationSec } from './render/mapping'
import { loadInstrument, type Instrument } from './audio/instrument'
import { PlaybackClock } from './audio/clock'
import { scheduleScore, stopAll } from './audio/scheduler'
import { ExternalAudioPlayer } from './audio/externalAudio'
import { loadVizConfig, saveVizConfig } from './config/storage'
import { ConfigPanel, type TrackPatch } from './ConfigPanel'
import type { Score } from './types'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 360

const MS_PER_SEC = 1000

function App() {
  const [score, setScore] = useState<Score | null>(null)
  const [config, setConfig] = useState(() => loadVizConfig())
  const [timeSec, setTimeSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [externalAudioName, setExternalAudioName] = useState<string | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const clockRef = useRef<PlaybackClock | null>(null)
  const instrumentRef = useRef<Instrument | null>(null)
  const externalPlayerRef = useRef<ExternalAudioPlayer | null>(null)
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

  function ensureAudioContext(): AudioContext {
    let ctx = audioCtxRef.current
    if (!ctx) {
      ctx = new AudioContext()
      audioCtxRef.current = ctx
      clockRef.current = new PlaybackClock(() => ctx!.currentTime)
    }
    return ctx
  }

  function stopSound() {
    stopAll(activeStopFnsRef.current)
    activeStopFnsRef.current = []
  }

  /**
   * (Re)starts sound from a score-timeline position: the uploaded audio file
   * when one is loaded (Flow 2), the SoundFont synth otherwise. Either way the
   * stop handles land in activeStopFnsRef so every existing stop path
   * (pause, seek, new file) works unchanged.
   */
  function startSoundAt(fromSec: number, forScore: Score, offsetMsNow: number) {
    const ctx = audioCtxRef.current!
    const external = externalPlayerRef.current
    if (external) {
      external.start(fromSec, offsetMsNow / MS_PER_SEC)
      activeStopFnsRef.current = [() => external.stop()]
    } else {
      activeStopFnsRef.current = scheduleScore(instrumentRef.current!, forScore, fromSec, ctx.currentTime)
    }
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

    const ctx = ensureAudioContext()
    await ctx.resume()

    if (!externalPlayerRef.current && !instrumentRef.current) {
      setIsLoadingAudio(true)
      instrumentRef.current = await loadInstrument(ctx)
      setIsLoadingAudio(false)
    }

    clockRef.current!.play(timeSec)
    startSoundAt(timeSec, score, offsetMs)
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(runLoop)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = Number(e.target.value)
    setTimeSec(newTime)
    stopSound()

    if (isPlaying && clockRef.current && score) {
      clockRef.current.seek(newTime)
      startSoundAt(newTime, score, offsetMs)
    }
  }

  function handleOffsetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newOffsetMs = Number(e.target.value)
    setOffsetMs(newOffsetMs)

    if (isPlaying && externalPlayerRef.current && clockRef.current && score) {
      stopSound()
      startSoundAt(clockRef.current.getCurrentTimeSec(), score, newOffsetMs)
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
    // reschedule from the current position. Synth mode only: an uploaded
    // audio file always sounds all its tracks (color changes are visual-only).
    const clock = clockRef.current
    if (
      'visible' in patch &&
      isPlaying &&
      clock &&
      instrumentRef.current &&
      !externalPlayerRef.current
    ) {
      stopSound()
      startSoundAt(clock.getCurrentTimeSec(), next, offsetMs)
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

  async function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    stopPlayback()
    const ctx = ensureAudioContext()
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    externalPlayerRef.current = new ExternalAudioPlayer(ctx, buffer)
    setExternalAudioName(file.name)
  }

  function handleRemoveExternalAudio() {
    stopPlayback()
    externalPlayerRef.current = null
    setExternalAudioName(null)
    setOffsetMs(0)
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
          <input type="file" accept=".mid,.midi" aria-label="MIDI file" onChange={handleFileChange} />
          <div className="external-audio">
            {externalAudioName ? (
              <>
                <span>
                  Audio: <strong>{externalAudioName}</strong>
                </span>
                <button type="button" onClick={handleRemoveExternalAudio}>
                  Remove
                </button>
                <label className="config-row">
                  <span>Audio offset ({offsetMs} ms)</span>
                  <input
                    type="range"
                    aria-label="Audio offset"
                    min={-1000}
                    max={1000}
                    step={5}
                    value={offsetMs}
                    onChange={handleOffsetChange}
                  />
                </label>
              </>
            ) : (
              <label>
                Audio file (optional, replaces synth):{' '}
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav"
                  aria-label="Audio file"
                  onChange={handleAudioFileChange}
                />
              </label>
            )}
          </div>
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
