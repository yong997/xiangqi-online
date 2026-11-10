import { describe, expect, it } from 'vitest'

describe('音效合成', () => {
  it('走子与将军分别创建对应数量的音调', async () => {
    let count = 0

    const makeOscillator = () => ({
      type: '',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    })
    const makeGain = () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    })
    const fakeCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: async () => {},
      createOscillator: () => {
        count += 1
        return makeOscillator()
      },
      createGain: () => makeGain(),
    }

    ;(globalThis as unknown as { window: unknown }).window = {
      AudioContext: class {
        constructor() {
          return fakeCtx
        }
      },
    }

    const mod = await import('../../src/ui/sound')
    mod.setSoundEnabled(true)

    count = 0
    mod.playSfx('move')
    expect(count).toBe(2)

    count = 0
    mod.playSfx('check')
    expect(count).toBe(3)
  })
})
