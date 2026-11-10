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

    // 无语音合成能力时，将军回退为合成提示音（3 个音调）
    count = 0
    mod.playSfx('check')
    expect(count).toBe(3)

    // 有语音合成时，朗读“将军”且不再创建提示音
    const spoken: string[] = []
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window
    win.speechSynthesis = {
      cancel() {},
      speak(utterance: { text: string }) {
        spoken.push(utterance.text)
      },
      getVoices() {
        return []
      },
    }
    win.SpeechSynthesisUtterance = class {
      text: string
      lang = ''
      rate = 1
      pitch = 1
      volume = 1
      voice: unknown = null
      constructor(text: string) {
        this.text = text
      }
    }
    count = 0
    mod.playSfx('check')
    expect(spoken).toEqual(['将军'])
    expect(count).toBe(0)
  })
})
