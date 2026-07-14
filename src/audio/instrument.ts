import { Soundfont2 } from 'smplr'
import { SoundFont2 } from 'soundfont2'

const SOUNDFONT_URL = '/soundfonts/ChaosBank.sf2'

export interface Instrument {
  start(opts: { note: number; velocity: number; time: number; duration: number }): void
  stop(): void
}

export async function loadInstrument(ctx: BaseAudioContext): Promise<Instrument> {
  const sampler = Soundfont2(ctx, {
    url: SOUNDFONT_URL,
    createSoundfont: (data) => new SoundFont2(data),
  })
  await sampler.ready

  const [firstInstrumentName] = sampler.instrumentNames
  if (firstInstrumentName) {
    await sampler.loadInstrument(firstInstrumentName)
  }

  return {
    start(opts) {
      sampler.start(opts)
    },
    stop() {
      sampler.stop()
    },
  }
}
