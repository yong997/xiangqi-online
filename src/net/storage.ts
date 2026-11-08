import type { GameStatus } from '../game/types'
import type { Seat } from './types'

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
