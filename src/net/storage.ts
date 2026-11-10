import type { GameStatus, GameVariant } from '../game/types'
import type { TimeControl } from './clock'
import { TIME_CONTROL_OFF } from './clock'
import type { EndReason, Seat } from './types'

const CLIENT_ID_KEY = 'xq:clientId'
const NAME_KEY = 'xq:name'
const SESSION_PREFIX = 'xq:session:'

function sessionKey(room: string, clientId: string): string {
  // 同一浏览器开两个标签页调试时，每个标签页的座位/棋局分开存，避免互相覆盖。
  return `${SESSION_PREFIX}${room}:${clientId}`
}

export interface SavedSession {
  clientId: string
  seat: Seat | null
  name: string
  moves: number[]
  status: GameStatus
  updatedAt: number
  variant: GameVariant
  seed: number
  timeControl: TimeControl
  redTotalMs: number | null
  blackTotalMs: number | null
  turnStartedAt: number | null
  turnElapsedMs: number
  clockPaused: boolean
  endReason: EndReason | null
}

let memoryClientId: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * clientId 放在 sessionStorage：每个标签页独立，但对刷新保持不变。
 * 这样同浏览器双标签调试不会互相顶掉座位，刷新又能夺回原座位。
 */
export function getClientId(): string {
  if (memoryClientId) return memoryClientId
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY)
    if (existing) {
      memoryClientId = existing
      return existing
    }
    const created = randomId()
    sessionStorage.setItem(CLIENT_ID_KEY, created)
    memoryClientId = created
    return created
  } catch {
    memoryClientId = randomId()
    return memoryClientId
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // 隐私模式等场景忽略
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseTimeControl(value: unknown): TimeControl {
  if (!value || typeof value !== 'object') return TIME_CONTROL_OFF
  const raw = value as Partial<TimeControl>
  const perMoveMs = numberOrNull(raw.perMoveMs)
  const totalMs = numberOrNull(raw.totalMs)
  if (perMoveMs == null && totalMs == null) return TIME_CONTROL_OFF
  return { perMoveMs, totalMs }
}

function parseEndReason(value: unknown): EndReason | null {
  return value === 'timeout' || value === 'resign' || value === 'draw' ? value : null
}

export function loadSavedSession(room: string, clientId: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(room, clientId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedSession>
    if (!parsed || !Array.isArray(parsed.moves)) return null
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      seat: parsed.seat === 'red' || parsed.seat === 'black' ? parsed.seat : null,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      moves: parsed.moves.filter((n): n is number => typeof n === 'number'),
      status: parsed.status ?? 'playing',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      variant: parsed.variant === 'jieqi' ? 'jieqi' : 'standard',
      seed: typeof parsed.seed === 'number' ? parsed.seed : 0,
      timeControl: parseTimeControl(parsed.timeControl),
      redTotalMs: numberOrNull(parsed.redTotalMs),
      blackTotalMs: numberOrNull(parsed.blackTotalMs),
      turnStartedAt: numberOrNull(parsed.turnStartedAt),
      turnElapsedMs: numberOrNull(parsed.turnElapsedMs) ?? 0,
      clockPaused: parsed.clockPaused === true,
      endReason: parseEndReason(parsed.endReason),
    }
  } catch {
    return null
  }
}

export function saveSession(room: string, session: SavedSession): void {
  try {
    localStorage.setItem(sessionKey(room, session.clientId), JSON.stringify(session))
  } catch {
    // 忽略存储失败
  }
}

export function clearSession(room: string, clientId: string): void {
  try {
    localStorage.removeItem(sessionKey(room, clientId))
  } catch {
    // 忽略
  }
}
