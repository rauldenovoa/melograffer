/**
 * Deterministic frame <-> time mapping for the offline exporter: frame N is
 * always drawn at exactly startSec + N/fps seconds — never a wall-clock
 * sample — so the render is reproducible and frame-accurate (SPEC §3 Flow 3).
 */

/** Total number of frames covering [startSec, endSec) at the given fps. */
export function frameCount(startSec: number, endSec: number, fps: number): number {
  return Math.max(0, Math.round((endSec - startSec) * fps))
}

/** The exact timeline second at which frame `n` (0-based) should be drawn. */
export function frameTimeSec(startSec: number, n: number, fps: number): number {
  return startSec + n / fps
}
