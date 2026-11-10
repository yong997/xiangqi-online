/**
 * 轻量音效：用 Web Audio 合成，无需外部音频文件，随单文件构建一起打包。
 * - move：走子“嗒”声
 * - check：将军提示音（上行三音）
 * 浏览器自动播放限制：首次用户触摸/点击后解锁 AudioContext。
 */

const STORAGE_KEY = 'xq:sound'

type SfxName = 'move' | 'check'

let audioCtx: AudioContext | null = null
let enabled = true

try {
  if (localStorage.getItem(STORAGE_KEY) === 'off') enabled = false
} catch {
  // 忽略隐私模式存储异常
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      audioCtx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      return null
    }
  }
  return audioCtx
}

/** 在首次用户手势时解锁/恢复音频上下文。 */
export function installSoundUnlock(): void {
  if (typeof window === 'undefined') return
  const unlock = () => {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

interface ToneOptions {
  type?: OscillatorType
  gain?: number
  when?: number
  glideTo?: number
}

function tone(freq: number, duration: number, options: ToneOptions = {}): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  const { type = 'sine', gain = 0.15, when = 0, glideTo } = options
  const start = ctx.currentTime + when
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (glideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + duration)
  }
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.012, duration / 2))
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

function playMoveSound(): void {
  // 木质感“嗒”声：高频短音 + 低一档的余音
  tone(720, 0.09, { type: 'triangle', gain: 0.13 })
  tone(1080, 0.05, { type: 'triangle', gain: 0.06, when: 0.008 })
}

function playCheckSound(): void {
  // 将军：上行三音，明显区别于走子
  tone(880, 0.16, { type: 'triangle', gain: 0.16 })
  tone(1174.66, 0.2, { type: 'triangle', gain: 0.16, when: 0.16 })
  tone(1567.98, 0.22, { type: 'sine', gain: 0.1, when: 0.32 })
}

export function playSfx(name: SfxName): void {
  if (!enabled) return
  if (name === 'move') playMoveSound()
  else playCheckSound()
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // 忽略
  }
}
