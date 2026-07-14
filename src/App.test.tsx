import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

const { noteStopFns } = vi.hoisted(() => ({ noteStopFns: [] as Array<ReturnType<typeof vi.fn>> }))

vi.mock('./audio/instrument', () => ({
  loadInstrument: vi.fn().mockResolvedValue({
    start: vi.fn(() => {
      const stop = vi.fn()
      noteStopFns.push(stop)
      return stop
    }),
  }),
}))

class FakeAudioContext {
  currentTime = 0
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}
vi.stubGlobal('AudioContext', FakeAudioContext)

afterEach(() => {
  noteStopFns.length = 0
})

describe('App', () => {
  it('renders the heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /melograffer/i }),
    ).toBeInTheDocument()
  })

  it('renders a track list after a MIDI file is dropped', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    const file = new File([buffer], 'multitrack.mid')

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
      expect(screen.getByText(/staffB:/)).toBeInTheDocument()
    })
  })

  it('shows a canvas and a scrub slider once a MIDI file is loaded', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    const file = new File([buffer], 'multitrack.mid')

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(document.querySelector('canvas')).toBeInTheDocument()
    })

    const slider = screen.getByRole('slider', { name: /playback position/i })
    expect(Number(slider.getAttribute('max'))).toBeGreaterThan(0)

    fireEvent.change(slider, { target: { value: '1' } })
    expect((slider as HTMLInputElement).value).toBe('1')
  })

  it('clicking Play loads the instrument and toggles to a Pause button', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    const file = new File([buffer], 'multitrack.mid')

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
    })

    const playButton = screen.getByRole('button', { name: /play/i })
    expect(playButton).toBeEnabled()
    fireEvent.click(playButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })
    expect(noteStopFns.length).toBeGreaterThan(0)
    expect(noteStopFns.every((stop) => stop.mock.calls.length === 0)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()
    })
    // Pausing must stop every note that was scheduled, not just the rAF/visual loop.
    expect(noteStopFns.every((stop) => stop.mock.calls.length === 1)).toBe(true)
  })

  it('seeking while playing stops the previously scheduled notes before scheduling new ones', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    const file = new File([buffer], 'multitrack.mid')

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })

    const stopFnsFromFirstSchedule = [...noteStopFns]
    expect(stopFnsFromFirstSchedule.length).toBeGreaterThan(0)

    const slider = screen.getByRole('slider', { name: /playback position/i })
    fireEvent.change(slider, { target: { value: '1' } })

    // Every note from the pre-seek schedule must be stopped exactly once...
    expect(stopFnsFromFirstSchedule.every((stop) => stop.mock.calls.length === 1)).toBe(true)
    // ...and a fresh set of notes scheduled from the new position, none of them stopped yet.
    const stopFnsFromSecondSchedule = noteStopFns.filter((stop) => !stopFnsFromFirstSchedule.includes(stop))
    expect(stopFnsFromSecondSchedule.length).toBeGreaterThan(0)
    expect(stopFnsFromSecondSchedule.every((stop) => stop.mock.calls.length === 0)).toBe(true)
  })

  it('choosing a new file while playing stops the previous sound', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    const file = new File([buffer], 'multitrack.mid')

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })

    const stopFnsFromFirstFile = [...noteStopFns]
    expect(stopFnsFromFirstFile.length).toBeGreaterThan(0)

    const otherBuffer = readFileSync(resolve(__dirname, '../fixtures/bach_invention.mid'))
    const otherFile = new File([otherBuffer], 'bach_invention.mid')
    fireEvent.change(fileInput, { target: { files: [otherFile] } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()
    })
    expect(stopFnsFromFirstFile.every((stop) => stop.mock.calls.length === 1)).toBe(true)
  })
})
