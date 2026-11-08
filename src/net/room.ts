export interface RouteLobby {
  name: 'lobby'
}

export interface RouteGame {
  name: 'game'
  room: string
  intent: 'create' | 'join'
}

export interface RouteLocal {
  name: 'local'
}

export type Route = RouteLobby | RouteGame | RouteLocal

/** 去掉 0/O/1/I/L 等易混字符，6 位约 10 亿种组合。 */
const ROOM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function generateRoomCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  return code
}

export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8)
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  if (raw === '/local') return { name: 'local' }

  const [path, query = ''] = raw.split('?')
  const match = path.match(/^\/r\/([0-9A-Za-z]+)$/)
  if (!match) return { name: 'lobby' }

  const room = normalizeRoomCode(match[1])
  if (!room) return { name: 'lobby' }

  const params = new URLSearchParams(query)
  return {
    name: 'game',
    room,
    intent: params.get('host') === '1' ? 'create' : 'join',
  }
}

/** 分享给朋友的链接是加入链接，不带 host=1。 */
export function inviteLink(room: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/r/${room}`
}

export function createRoomHash(room: string): string {
  return `#/r/${room}?host=1`
}

export function joinRoomHash(room: string): string {
  return `#/r/${room}`
}
