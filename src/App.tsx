import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import { drawFrame } from './render/drawFrame'
import { DEFAULT_VIZ_CONFIG } from './render/defaultConfig'
import { scoreDurationSec } from './render/mapping'
import type { Score } from './types'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 360

function App() {
  const [score, setScore] = useState<Score | null>(null)
  const [timeSec, setTimeSec] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const duration = useMemo(() => (score ? scoreDurationSec(score) : 0), [score])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    setScore(parseMidi(buffer))
    setTimeSec(0)
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !score) return
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, timeSec)
  }, [score, timeSec])

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
      <input
        type="range"
        aria-label="Playback position"
        min={0}
        max={duration}
        step={0.01}
        value={timeSec}
        disabled={!score}
        onChange={(e) => setTimeSec(Number(e.target.value))}
      />
    </main>
  )
}

export default App
