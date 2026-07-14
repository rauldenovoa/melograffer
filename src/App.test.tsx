import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

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
})
