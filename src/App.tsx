import { useState } from 'react'
import './App.css'
import { parseMidi } from './midi/parseMidi'
import type { Score } from './types'

function App() {
  const [score, setScore] = useState<Score | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    setScore(parseMidi(buffer))
  }

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
    </main>
  )
}

export default App
