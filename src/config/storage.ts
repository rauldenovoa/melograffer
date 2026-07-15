import type { VizConfig } from '../types'
import { DEFAULT_VIZ_CONFIG } from '../render/defaultConfig'

// v2: dotScale changed from absolute pixels to canvas-relative units, so v1
// entries are silently abandoned rather than misread.
const STORAGE_KEY = 'melograffer.vizConfig.v2'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Restores the persisted VizConfig, falling back to defaults field-by-field
 * so stale/garbage entries (old schema versions, hand-edited values) can
 * never produce an invalid config. SPEC §3: settings persist in localStorage.
 */
export function loadVizConfig(storage: StorageLike = localStorage): VizConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return { ...DEFAULT_VIZ_CONFIG }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ...DEFAULT_VIZ_CONFIG }
  }

  const candidate = parsed as Record<string, unknown>
  const config = { ...DEFAULT_VIZ_CONFIG }

  for (const key of Object.keys(DEFAULT_VIZ_CONFIG) as Array<keyof VizConfig>) {
    const value = candidate[key]
    if (typeof value !== typeof DEFAULT_VIZ_CONFIG[key]) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    if (key === 'radiusMode' && value !== 'sqrt' && value !== 'linear') continue
    // Same-typed, validated value — the cast is safe per the checks above.
    ;(config[key] as unknown) = value
  }

  config.pxPerSec = Math.max(config.pxPerSec, 1)
  config.dotScale = Math.max(config.dotScale, 0.1)
  config.playheadX = Math.min(Math.max(config.playheadX, 0), 1)

  return config
}

export function saveVizConfig(config: VizConfig, storage: StorageLike = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(config))
}
