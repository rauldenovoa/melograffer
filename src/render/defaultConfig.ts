import type { VizConfig } from '../types'

export const DEFAULT_VIZ_CONFIG: VizConfig = {
  bg: '#101014',
  pxPerSec: 120,
  dotScale: 50,
  radiusMode: 'sqrt',
  playheadX: 1 / 3,
  showBarLines: true,
  showBarNumbers: true,
  showConnectingLines: true,
  leadInBars: 2,
  leadOutBars: 2,
  instrumentName: '',
  exportAspect: 'landscape',
}
