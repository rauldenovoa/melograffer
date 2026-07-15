import type { Score, Track, VizConfig } from './types'
import { DEFAULT_VIZ_CONFIG } from './render/defaultConfig'

export type TrackPatch = Partial<Pick<Track, 'visible' | 'color'>>

interface ConfigPanelProps {
  config: VizConfig
  onConfigChange: (next: VizConfig) => void
  score: Score | null
  onTrackChange: (trackId: string, patch: TrackPatch) => void
}

export function ConfigPanel({ config, onConfigChange, score, onTrackChange }: ConfigPanelProps) {
  const set = <K extends keyof VizConfig>(key: K, value: VizConfig[K]) =>
    onConfigChange({ ...config, [key]: value })

  return (
    <aside className="config-panel">
      {score && (
        <fieldset>
          <legend>Tracks</legend>
          {score.tracks.map((track) => (
            <div key={track.id} className="config-row track-row">
              <input
                type="checkbox"
                aria-label={`Show track ${track.name}`}
                checked={track.visible}
                onChange={(e) => onTrackChange(track.id, { visible: e.target.checked })}
              />
              <input
                type="color"
                aria-label={`Color for track ${track.name}`}
                value={track.color}
                onChange={(e) => onTrackChange(track.id, { color: e.target.value })}
              />
              <span className="track-name">{track.name}</span>
            </div>
          ))}
        </fieldset>
      )}

      <fieldset>
        <legend>Appearance</legend>
        <label className="config-row">
          <span>Background</span>
          <input
            type="color"
            aria-label="Background color"
            value={config.bg}
            onChange={(e) => set('bg', e.target.value)}
          />
        </label>
        <label className="config-row">
          <span>Scroll speed ({config.pxPerSec} px/s)</span>
          <input
            type="range"
            aria-label="Scroll speed"
            min={20}
            max={400}
            step={10}
            value={config.pxPerSec}
            onChange={(e) => set('pxPerSec', Number(e.target.value))}
          />
        </label>
        <label className="config-row">
          <span>Dot scale ({config.dotScale})</span>
          <input
            type="range"
            aria-label="Dot scale"
            min={1}
            max={20}
            step={1}
            value={config.dotScale}
            onChange={(e) => set('dotScale', Number(e.target.value))}
          />
        </label>
        <label className="config-row">
          <span>Dot sizing</span>
          <select
            aria-label="Dot sizing mode"
            value={config.radiusMode}
            onChange={(e) => set('radiusMode', e.target.value as VizConfig['radiusMode'])}
          >
            <option value="sqrt">√duration</option>
            <option value="linear">linear (capped)</option>
          </select>
        </label>
        <label className="config-row">
          <span>Playhead position ({Math.round(config.playheadX * 100)}%)</span>
          <input
            type="range"
            aria-label="Playhead position"
            min={0.1}
            max={0.9}
            step={0.05}
            value={config.playheadX}
            onChange={(e) => set('playheadX', Number(e.target.value))}
          />
        </label>
        <label className="config-row">
          <input
            type="checkbox"
            checked={config.showBarLines}
            onChange={(e) => set('showBarLines', e.target.checked)}
          />
          <span>Bar lines</span>
        </label>
        <label className="config-row">
          <input
            type="checkbox"
            checked={config.showBarNumbers}
            onChange={(e) => set('showBarNumbers', e.target.checked)}
          />
          <span>Bar numbers</span>
        </label>
        <label className="config-row">
          <input
            type="checkbox"
            checked={config.showConnectingLines}
            onChange={(e) => set('showConnectingLines', e.target.checked)}
          />
          <span>Connecting lines</span>
        </label>
        <button type="button" onClick={() => onConfigChange({ ...DEFAULT_VIZ_CONFIG })}>
          Reset to defaults
        </button>
      </fieldset>
    </aside>
  )
}
