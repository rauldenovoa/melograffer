import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import type { Score, VizConfig } from '../types'
import { drawFrame } from '../render/drawFrame'
import { frameCount, frameTimeSec } from './frameTiming'

const EXPORT_FPS = 60
const VIDEO_BITRATE = 8_000_000
const AUDIO_BITRATE = 128_000
/**
 * High profile, level 4.2 — the standard level for 1080p60 (level 4.2's
 * 522,240 MaxMBPS comfortably covers 1920x1080 @ 60fps's ~489,600; level 4.1
 * and below top out around 1080p30). Deliberately not a higher level like
 * 5.1 (meant for 4K+) — an over-specified level for the actual resolution is
 * an unusual combination real-world decoders/transcoders are less likely to
 * have been tested against.
 */
const VIDEO_CODEC = 'avc1.64002A'
const AAC_LC_CODEC = 'mp4a.40.2'
/** A keyframe every 2s keeps the file seekable without bloating it. */
const KEYFRAME_INTERVAL_FRAMES = EXPORT_FPS * 2
/** Caps how many frames sit in the encoder's queue at once, so a long piece doesn't buffer every frame in memory. */
const MAX_ENCODE_QUEUE_SIZE = 2
const AUDIO_CHUNK_SECONDS = 1

/** Output pixel dimensions for each SPEC §3 platform preset — exact platform standards. */
export const EXPORT_RESOLUTIONS: Record<VizConfig['exportAspect'], { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 }, // YouTube 16:9
  portrait: { width: 1080, height: 1920 }, // Instagram Reels/Stories/feed 9:16
}

/** Thrown when the browser lacks WebCodecs or can't encode the SPEC-mandated H.264+AAC config. */
export class UnsupportedBrowserError extends Error {}

export interface ExportMp4Options {
  score: Score
  config: VizConfig
  /** Pre-rendered offline audio (see renderAudio.ts) covering [startSec, endSec]. */
  audioBuffer: AudioBuffer
  width: number
  height: number
  startSec: number
  endSec: number
  /** Fraction 0..1, called after each encoded video frame. */
  onProgress?: (fraction: number) => void
}

async function assertWebCodecsSupport(
  videoConfig: VideoEncoderConfig,
  audioConfig: AudioEncoderConfig,
): Promise<void> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    throw new UnsupportedBrowserError(
      'MP4 export needs WebCodecs (VideoEncoder/AudioEncoder) support — use Chrome or Edge.',
    )
  }
  const [videoSupport, audioSupport] = await Promise.all([
    VideoEncoder.isConfigSupported(videoConfig),
    AudioEncoder.isConfigSupported(audioConfig),
  ])
  if (!videoSupport.supported || !audioSupport.supported) {
    throw new UnsupportedBrowserError(
      'This browser cannot encode H.264 + AAC via WebCodecs — use Chrome or Edge.',
    )
  }
}

/** Backpressure: waits until the encoder has room, so a whole piece's frames never queue up in memory at once. */
function waitForEncoderQueue(
  encoder: { encodeQueueSize: number },
  maxQueueSize: number,
): Promise<void> {
  return new Promise((resolve) => {
    function check() {
      if (encoder.encodeQueueSize <= maxQueueSize) resolve()
      else setTimeout(check, 0)
    }
    check()
  })
}

/** Feeds an AudioBuffer into an AudioEncoder as fixed-size planar chunks. */
function encodeAudioBuffer(encoder: AudioEncoder, audioBuffer: AudioBuffer): void {
  const { numberOfChannels, sampleRate, length } = audioBuffer
  const channelData: Float32Array[] = []
  for (let c = 0; c < numberOfChannels; c++) channelData.push(audioBuffer.getChannelData(c))

  const chunkFrames = sampleRate * AUDIO_CHUNK_SECONDS
  for (let start = 0; start < length; start += chunkFrames) {
    const frames = Math.min(chunkFrames, length - start)
    const planar = new Float32Array(frames * numberOfChannels)
    for (let c = 0; c < numberOfChannels; c++) {
      planar.set(channelData[c].subarray(start, start + frames), c * frames)
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels,
      numberOfFrames: frames,
      timestamp: Math.round((start / sampleRate) * 1_000_000),
      data: planar,
    })
    encoder.encode(audioData)
    audioData.close()
  }
}

/**
 * Deterministic offline export (SPEC §3 Flow 3): renders every frame of
 * `drawFrame` at exactly N/fps seconds via frameTiming.ts (never a screen
 * capture), encodes it with WebCodecs, and muxes it with the pre-rendered
 * audio buffer (renderAudio.ts) into an H.264+AAC MP4 via mp4-muxer.
 */
export async function exportMp4(opts: ExportMp4Options): Promise<Blob> {
  const { score, config, audioBuffer, width, height, startSec, endSec, onProgress } = opts

  const videoConfig: VideoEncoderConfig = {
    codec: VIDEO_CODEC,
    width,
    height,
    framerate: EXPORT_FPS,
    bitrate: VIDEO_BITRATE,
    hardwareAcceleration: 'prefer-hardware',
  }
  const audioConfig: AudioEncoderConfig = {
    codec: AAC_LC_CODEC,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
    bitrate: AUDIO_BITRATE,
  }
  await assertWebCodecsSupport(videoConfig, audioConfig)

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create an OffscreenCanvas 2D context.')

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: EXPORT_FPS },
    audio: { codec: 'aac', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate },
    fastStart: 'in-memory',
  })

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  videoEncoder.configure(videoConfig)

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  audioEncoder.configure(audioConfig)

  const total = frameCount(startSec, endSec, EXPORT_FPS)
  const frameDurationUs = Math.round(1_000_000 / EXPORT_FPS)
  for (let n = 0; n < total; n++) {
    await waitForEncoderQueue(videoEncoder, MAX_ENCODE_QUEUE_SIZE)

    drawFrame(ctx, score, config, frameTimeSec(startSec, n, EXPORT_FPS))
    const frame = new VideoFrame(canvas, {
      timestamp: n * frameDurationUs,
      duration: frameDurationUs,
    })
    videoEncoder.encode(frame, { keyFrame: n % KEYFRAME_INTERVAL_FRAMES === 0 })
    frame.close()

    onProgress?.((n + 1) / total)
  }

  encodeAudioBuffer(audioEncoder, audioBuffer)

  await Promise.all([videoEncoder.flush(), audioEncoder.flush()])
  videoEncoder.close()
  audioEncoder.close()
  muxer.finalize()

  return new Blob([target.buffer], { type: 'video/mp4' })
}
