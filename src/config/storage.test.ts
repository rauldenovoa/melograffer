import { beforeEach, describe, expect, it } from 'vitest'
import { loadVizConfig, saveVizConfig } from './storage'
import { DEFAULT_VIZ_CONFIG } from '../render/defaultConfig'
import type { VizConfig } from '../types'

const STORAGE_KEY = 'melograffer.vizConfig.v1'

beforeEach(() => {
  localStorage.clear()
})

describe('loadVizConfig / saveVizConfig', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadVizConfig()).toEqual(DEFAULT_VIZ_CONFIG)
  })

  it('round-trips a saved config', () => {
    const config: VizConfig = {
      bg: '#ffffff',
      pxPerSec: 200,
      dotScale: 4,
      radiusMode: 'linear',
      playheadX: 0.5,
      showBarLines: false,
      showBarNumbers: false,
      showConnectingLines: false,
    }
    saveVizConfig(config)
    expect(loadVizConfig()).toEqual(config)
  })

  it('falls back to defaults on garbage JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{')
    expect(loadVizConfig()).toEqual(DEFAULT_VIZ_CONFIG)
  })

  it('keeps valid fields and replaces invalid ones field-by-field', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bg: '#123456',
        pxPerSec: 'fast', // wrong type
        dotScale: Infinity, // JSON.stringify(Infinity) can't occur, but null can
        radiusMode: 'cubic', // not an allowed variant
        playheadX: 4, // out of range → clamped
        showBarLines: false,
        unknownKey: 'ignored',
      }),
    )
    const config = loadVizConfig()
    expect(config.bg).toBe('#123456')
    expect(config.showBarLines).toBe(false)
    expect(config.pxPerSec).toBe(DEFAULT_VIZ_CONFIG.pxPerSec)
    expect(config.radiusMode).toBe(DEFAULT_VIZ_CONFIG.radiusMode)
    expect(config.playheadX).toBe(1)
    expect('unknownKey' in config).toBe(false)
  })
})
