import type { GameStatus } from '../game/types'

export type Seat = 'red' | 'black'

export type TransportKind = 'goeasy' | 'local'
export type TransportStatus = 'connecting' | 'connected' | 'disconnected'

export interface WireEnvelope {
  v: 1
  room: string
  from: string
  ts: number
  msgId: string
}

export type WirePayload =
  | { t: 'hello'; seat: Seat | 'auto' | null; moveNo: number; name: string }
  | { t: 'seat'; seat: Seat | null; to?: string }
  | { t: 'move'; move: number; moveNo: number }
  | { t: 'sync-req'; to?: string }
  | {
      t: 'sync'
      to?: string
      moves: number[]
      status: GameStatus
      seatMap: Record<string, Seat>
      nameMap: Record<string, string>
    }
  | { t: 'undo-req'; to?: string; targetMoveNo: number }
  | { t: 'undo-res'; to?: string; accept: boolean; targetMoveNo: number }
  | { t: 'draw-req'; to?: string }
  | { t: 'draw-res'; to?: string; accept: boolean }
  | { t: 'resign' }
  | { t: 'rematch-req'; to?: string }
  | { t: 'rematch-res'; to?: string; accept: boolean }
  | { t: 'chat'; text: string; name: string }
  | { t: 'ping' }
  | { t: 'pong' }

export type WireMsg = WireEnvelope & WirePayload

export interface Transport {
  readonly kind: TransportKind
  connect(): Promise<void>
  send(msg: WireMsg): void
  onMessage(handler: (msg: WireMsg) => void): () => void
  onStatus(handler: (status: TransportStatus) => void): () => void
  close(): void
}
