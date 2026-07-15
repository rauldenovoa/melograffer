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

interface FakeBufferSource {
  buffer: unknown
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

const bufferSources: FakeBufferSource[] = []

class FakeAudioContext {
  currentTime = 0
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
  decodeAudioData = vi.fn().mockResolvedValue({ duration: 60 })
  createBufferSource = vi.fn(() => {
    const source: FakeBufferSource = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    bufferSources.push(source)
    return source
  })
}
vi.stubGlobal('AudioContext', FakeAudioContext)

afterEach(() => {
  noteStopFns.length = 0
  bufferSources.length = 0
  localStorage.clear()
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

  it('hiding a track while playing stops the old schedule and reschedules without that track', async () => {
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

    const stopFnsBeforeToggle = [...noteStopFns]
    const totalNotes = stopFnsBeforeToggle.length
    expect(totalNotes).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('checkbox', { name: /show track staffA:/i }))

    expect(stopFnsBeforeToggle.every((stop) => stop.mock.calls.length === 1)).toBe(true)
    const rescheduled = noteStopFns.filter((stop) => !stopFnsBeforeToggle.includes(stop))
    // Only the remaining visible track's notes come back.
    expect(rescheduled.length).toBeGreaterThan(0)
    expect(rescheduled.length).toBeLessThan(totalNotes)
    expect(rescheduled.every((stop) => stop.mock.calls.length === 0)).toBe(true)
  })

  it('uploading an audio file switches playback to it: no synth, offset slider live', async () => {
    const { loadInstrument } = await import('./audio/instrument')
    vi.mocked(loadInstrument).mockClear()

    render(<App />)
    const midiBuffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File([midiBuffer], 'multitrack.mid')] },
    })
    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
    })

    const audioInput = screen.getByLabelText(/audio file/i)
    fireEvent.change(audioInput, {
      target: { files: [new File([new Uint8Array([1, 2, 3])], 'render.mp3')] },
    })
    await waitFor(() => {
      expect(screen.getByText(/render\.mp3/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })

    // Flow 2 (SPEC §2): the uploaded file plays instead of the SoundFont synth.
    expect(loadInstrument).not.toHaveBeenCalled()
    expect(noteStopFns).toHaveLength(0)
    expect(bufferSources).toHaveLength(1)
    // Playback begins at the (negative) lead-in, so the audio is scheduled to
    // start after exactly the lead-in delay, from the top of the buffer.
    const leadInSec = -Number(
      (screen.getByRole('slider', { name: /playback position/i }) as HTMLInputElement).min,
    )
    expect(leadInSec).toBeGreaterThan(0)
    expect(bufferSources[0].start).toHaveBeenCalledWith(leadInSec, 0)

    // Nudging the offset restarts the audio shifted by that many ms
    // (fake clock is still at the lead-in start, so -500ms of offset moves
    // the delayed start 0.5s earlier).
    fireEvent.change(screen.getByRole('slider', { name: /audio offset/i }), {
      target: { value: '-500' },
    })
    expect(bufferSources[0].stop).toHaveBeenCalled()
    expect(bufferSources).toHaveLength(2)
    expect(bufferSources[1].start).toHaveBeenCalledWith(leadInSec - 0.5, 0)

    // Removing the audio pauses and stops the external source.
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(bufferSources[1].stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/audio file/i)).toBeInTheDocument()
  })

  it('starts the timeline two bars early and ends two bars after the last note (lead-in/out)', async () => {
    render(<App />)
    const buffer = readFileSync(resolve(__dirname, '../fixtures/multitrack.mid'))
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File([buffer], 'multitrack.mid')] },
    })
    await waitFor(() => {
      expect(screen.getByText(/staffA:/)).toBeInTheDocument()
    })

    const slider = screen.getByRole('slider', { name: /playback position/i }) as HTMLInputElement
    const min = Number(slider.min)
    const max = Number(slider.max)
    expect(min).toBeLessThan(0)
    // Position starts at the very beginning of the lead-in.
    expect(Number(slider.value)).toBeCloseTo(min)
    // Last note of multitrack.mid ends at ~43.64s; lead-out pushes max past it
    // by exactly the lead-in's magnitude (constant tempo, both are 2 bars).
    expect(max).toBeCloseTo(43.64 - min, 1)
  })

  it('persists config changes to localStorage and restores them on next mount', async () => {
    const { unmount } = render(<App />)

    const speed = screen.getByRole('slider', { name: /scroll speed/i })
    fireEvent.change(speed, { target: { value: '300' } })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('melograffer.vizConfig.v2') ?? '{}')
      expect(stored.pxPerSec).toBe(300)
    })

    unmount()
    render(<App />)
    expect(
      (screen.getByRole('slider', { name: /scroll speed/i }) as HTMLInputElement).value,
    ).toBe('300')
  })
})
