import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import { drawFrame } from './render/drawFrame'
import { barDurationsSec, findNoteAt, scoreDurationSec, timeAtX } from './render/mapping'
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

/** Audio restarts only after scrub events stop arriving for this long. */
const SCRUB_SETTLE_MS = 150

/** Pointer movement below this (canvas px) still counts as a click on release. */
const DRAG_THRESHOLD_PX = 4

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
  const pendingSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirrors for state the debounced-restart timeout must read fresh (its
  // closure would otherwise be stale by the time it fires).
  const scoreRef = useRef(score)
  scoreRef.current = score
  const offsetMsRef = useRef(offsetMs)
  offsetMsRef.current = offsetMs
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const duration = useMemo(() => (score ? scoreDurationSec(score) : 0), [score])
  const barSec = useMemo(
    () => (score ? barDurationsSec(score) : { first: 0, last: 0 }),
    [score],
  )
  // Lead-in silence runs on negative timeline seconds; lead-out replaces the
  // old automatic scroll-off buffer (user-controlled now, 0 = stop on the
  // last note even if dots freeze mid-canvas).
  const playbackStartSec = -config.leadInBars * barSec.first
  const playbackEndSec = duration + config.leadOutBars * barSec.last
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

  function cancelPendingSoundRestart() {
    if (pendingSoundTimerRef.current !== null) {
      clearTimeout(pendingSoundTimerRef.current)
      pendingSoundTimerRef.current = null
    }
  }

  /**
   * Silences everything immediately and restarts sound at the clock position
   * once scrub events settle. Skipping while playing must never sound the
   * notes between the old and new position — a drag emits dozens of change
   * events and rescheduling on each one machine-gunned every note crossed.
   */
  function restartSoundDebounced() {
    stopSound()
    cancelPendingSoundRestart()
    if (!isPlaying) return
    pendingSoundTimerRef.current = setTimeout(() => {
      pendingSoundTimerRef.current = null
      const clock = clockRef.current
      const currentScore = scoreRef.current
      if (!isPlayingRef.current || !clock || !currentScore) return
      startSoundAt(clock.getCurrentTimeSec(), currentScore, offsetMsRef.current)
    }, SCRUB_SETTLE_MS)
  }

  function stopPlayback() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    cancelPendingSoundRestart()
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

    // Playing from the very end restarts from the top (lead-in included).
    const startFrom = timeSec >= playbackEndSec ? playbackStartSec : timeSec
    setTimeSec(startFrom)
    clockRef.current!.play(startFrom)
    startSoundAt(startFrom, score, offsetMs)
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(runLoop)
  }

  /** Seek to a timeline position (slider or canvas); audio restart is debounced. */
  function scrubTo(sec: number) {
    const clamped = Math.min(Math.max(sec, playbackStartSec), playbackEndRef.current)
    setTimeSec(clamped)
    if (isPlaying) clockRef.current?.seek(clamped)
    restartSoundDebounced()
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    scrubTo(Number(e.target.value))
  }

  function handleOffsetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newOffsetMs = Number(e.target.value)
    setOffsetMs(newOffsetMs)
    offsetMsRef.current = newOffsetMs

    if (isPlaying && externalPlayerRef.current) {
      restartSoundDebounced()
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

  const canvasDragRef = useRef<{
    pointerId: number
    startXPx: number
    grabTimeSec: number
    moved: boolean
  } | null>(null)

  /** Pointer position in canvas-pixel space (the canvas is CSS-scaled). */
  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!score) return
    const { x } = canvasPoint(e)
    try {
      // Keeps the drag alive when the cursor leaves the canvas mid-scrub.
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Best-effort: synthetic events carry no active pointer id.
    }
    canvasDragRef.current = {
      pointerId: e.pointerId,
      startXPx: x,
      grabTimeSec: timeAtX(x, timeSec, config, canvasRef.current!.width),
      moved: false,
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = canvasDragRef.current
    if (!drag || e.pointerId !== drag.pointerId || !score) return
    const { x } = canvasPoint(e)
    if (!drag.moved && Math.abs(x - drag.startXPx) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    // Grab-the-score scrubbing: the moment grabbed on pointerdown stays under
    // the cursor, so dragging left advances time and dragging right rewinds.
    const playheadPx = config.playheadX * canvasRef.current!.width
    scrubTo(drag.grabTimeSec - (x - playheadPx) / config.pxPerSec)
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = canvasDragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    canvasDragRef.current = null
    if (drag.moved || !score) return
    // A clean click: jump to the clicked note, if any (empty space is a no-op).
    const canvas = canvasRef.current!
    const { x, y } = canvasPoint(e)
    const note = findNoteAt(score, config, timeSec, canvas.width, canvas.height, x, y)
    if (note) scrubTo(note.startSec)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    stopPlayback()
    const buffer = await file.arrayBuffer()
    const newScore = parseMidi(buffer)
    setScore(newScore)
    setTimeSec(-config.leadInBars * barDurationsSec(newScore).first)
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

  // Spacebar = play/pause, YouTube-style — but only when no form control has
  // focus. A focused button/checkbox/slider keeps the browser's native space
  // behavior (activate/toggle it), which is the standard.
  const playPauseRef = useRef<() => void>(() => {})
  playPauseRef.current = () => {
    void handlePlayPause()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || e.repeat) return
      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      ) {
        return
      }
      e.preventDefault() // keep the page from scrolling
      playPauseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
          />
          <div>
            <button onClick={handlePlayPause} disabled={!score || isLoadingAudio}>
              {isLoadingAudio ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <input
            type="range"
            className="scrub"
            aria-label="Playback position"
            min={playbackStartSec}
            max={playbackEndSec}
            step={0.01}
            value={Math.min(Math.max(timeSec, playbackStartSec), playbackEndSec)}
            disabled={!score}
            onChange={handleSeek}
          />
        </div>
      </div>
    </main>
  )
}

export default App
