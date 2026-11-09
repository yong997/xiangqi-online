import { opposite } from '../game/board'
import {
  applyMove,
  createGame,
  decodeMove,
  encodeMove,
  replayGame,
  toFenOf,
} from '../game/engine'
import type { GameState, GameStatus } from '../game/types'
import {
  evaluateClock,
  hasClock,
  statusForTimeout,
  TIME_CONTROL_OFF,
  type TimeControl,
} from './clock'
import { hasGoEasyConfig, createTransport } from './transport'
import type {
  EndReason,
  Seat,
  Transport,
  TransportStatus,
  WireMsg,
  WirePayload,
} from './types'
import { loadSavedSession, saveName, saveSession } from './storage'

export type Mode = 'online' | 'local'
export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'
export type RequestKind = 'undo' | 'draw' | 'rematch'

export interface ChatMessage {
  id: string
  from: string
  name: string
  text: string
  ts: number
  seat: Seat | null
}

export interface PendingRequest {
  kind: RequestKind
  from: string
  name: string
  incoming: boolean
  targetMoveNo?: number
}

export interface SessionState {
  mode: Mode
  room: string
  clientId: string
  name: string
  seat: Seat | null
  seatMap: Record<string, Seat>
  nameMap: Record<string, string>
  game: GameState
  conn: ConnStatus
  peerOnline: boolean
  chat: ChatMessage[]
  notice: string | null
  pending: PendingRequest | null
  transportMode: 'goeasy' | 'local' | 'none'
  startedAt: number
  /** 对局时限配置 */
  timeControl: TimeControl
  /** 红方在本回合开始时的剩余总用时（null=未启用总用时） */
  redTotalMs: number | null
  /** 黑方在本回合开始时的剩余总用时（null=未启用总用时） */
  blackTotalMs: number | null
  /** 当前回合本地开始时间；null 表示计时未启动 */
  turnStartedAt: number | null
  /** 最近一次计时 tick 的本地时间，驱动 UI 倒计时 */
  clockNow: number
  /** 对局结束原因（超时/认输/和棋） */
  endReason: EndReason | null
}

export interface SessionOptions {
  mode: Mode
  room: string
  clientId: string
  name: string
  intent: 'create' | 'join'
  timeControl?: TimeControl
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function isSeat(value: unknown): value is Seat {
  return value === 'red' || value === 'black'
}

export class SessionController {
  private state: SessionState
  private readonly listeners = new Set<() => void>()
  private readonly seenMessages = new Set<string>()
  private readonly lastSeen = new Map<string, number>()
  private readonly room: string
  private readonly mode: Mode
  private transport: Transport | null = null
  private unsubMessage: (() => void) | null = null
  private unsubStatus: (() => void) | null = null
  private running = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private presenceTimer: ReturnType<typeof setInterval> | null = null
  private helloTimer: ReturnType<typeof setInterval> | null = null
  private clockTimer: ReturnType<typeof setInterval> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private lastChatAt = 0

  constructor(options: SessionOptions) {
    this.room = options.room
    this.mode = options.mode

    const saved =
      options.mode === 'online'
        ? loadSavedSession(options.room, options.clientId)
        : null
    let game = createGame()
    if (saved && saved.moves.length > 0) {
      try {
        game = replayGame(saved.moves)
        if (saved.status !== 'playing') game = { ...game, status: saved.status }
      } catch {
        game = createGame()
      }
    }

    const savedSeat =
      saved && saved.clientId === options.clientId ? saved.seat : null
    const seat =
      options.mode === 'local'
        ? null
        : (savedSeat ?? (options.intent === 'create' ? 'red' : null))
    const name = options.name.trim() || saved?.name || '玩家'
    const timeControl: TimeControl =
      options.timeControl ?? saved?.timeControl ?? TIME_CONTROL_OFF
    const totalEnabled = timeControl.totalMs != null
    const restoring = saved != null && saved.status === 'playing'
    const redTotalMs = totalEnabled
      ? (restoring && saved?.redTotalMs != null ? saved.redTotalMs : timeControl.totalMs)
      : null
    const blackTotalMs = totalEnabled
      ? (restoring && saved?.blackTotalMs != null ? saved.blackTotalMs : timeControl.totalMs)
      : null

    this.state = {
      mode: options.mode,
      room: options.room,
      clientId: options.clientId,
      name,
      seat,
      seatMap: seat ? { [options.clientId]: seat } : {},
      nameMap: { [options.clientId]: name },
      game,
      conn: options.mode === 'local' ? 'connected' : 'idle',
      peerOnline: false,
      chat: [],
      notice: null,
      pending: null,
      transportMode:
        options.mode === 'local'
          ? 'none'
          : hasGoEasyConfig()
            ? 'goeasy'
            : 'local',
      startedAt: Date.now(),
      timeControl,
      redTotalMs,
      blackTotalMs,
      turnStartedAt: restoring && saved?.turnStartedAt != null ? saved.turnStartedAt : null,
      clockNow: Date.now(),
      endReason: saved && saved.status !== 'playing' ? saved.endReason ?? null : null,
    }

    if (options.mode === 'online') {
      this.lastSeen.set(options.clientId, Date.now())
      this.persist()
    }
  }

  getSnapshot = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    if (this.running) return
    this.running = true
    this.clockTimer = setInterval(() => this.tickClock(), 500)

    if (this.mode === 'local') {
      this.update({ conn: 'connected' })
      this.maybeStartClock()
      return
    }

    this.transport = createTransport(this.room, this.state.clientId)
    this.unsubMessage = this.transport.onMessage((msg) => this.handleMessage(msg))
    this.unsubStatus = this.transport.onStatus((status) => this.handleStatus(status))

    this.heartbeatTimer = setInterval(() => this.heartbeat(), 20_000)
    this.presenceTimer = setInterval(() => this.refreshPresence(), 5_000)
    this.helloTimer = setInterval(() => {
      if (this.running && this.state.conn === 'connected' && !this.state.seat) {
        this.announce()
      }
    }, 10_000)

    window.addEventListener('online', this.onWake)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.transport
      .connect()
      .catch((error: unknown) => {
        this.update({ conn: 'disconnected' })
        this.notify(error instanceof Error ? error.message : '连接实时服务失败')
      })
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.presenceTimer) clearInterval(this.presenceTimer)
    if (this.helloTimer) clearInterval(this.helloTimer)
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.heartbeatTimer = null
    this.presenceTimer = null
    this.helloTimer = null
    this.clockTimer = null
    this.unsubMessage?.()
    this.unsubStatus?.()
    this.unsubMessage = null
    this.unsubStatus = null
    this.transport?.close()
    this.transport = null
    window.removeEventListener('online', this.onWake)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private readonly onWake = (): void => {
    if (!this.running || this.mode !== 'online') return
    this.transport
      ?.connect()
      .then(() => this.announce())
      .catch(() => undefined)
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.tickClock()
      this.onWake()
    }
  }

  private handleStatus(status: TransportStatus): void {
    this.update({ conn: status })
    if (status === 'connected') {
      this.announce()
      this.refreshPresence()
    }
  }

  // ------------------------------------------------------------------ helpers

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private update(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private persist(): void {
    if (this.mode !== 'online' || !this.state.seat) return
    saveSession(this.room, {
      clientId: this.state.clientId,
      seat: this.state.seat,
      name: this.state.name,
      moves: this.state.game.moves.map(encodeMove),
      status: this.state.game.status,
      updatedAt: Date.now(),
      timeControl: this.state.timeControl,
      redTotalMs: this.state.redTotalMs,
      blackTotalMs: this.state.blackTotalMs,
      turnStartedAt: this.state.turnStartedAt,
      endReason: this.state.endReason,
    })
    saveName(this.state.name)
  }

  private setGame(game: GameState): void {
    const patch: Partial<SessionState> = { game }
    if (game.status !== 'playing') {
      patch.pending = null
      patch.turnStartedAt = null
    }
    this.update(patch)
    this.persist()
  }

  // ------------------------------------------------------------------- clocks

  private bothSeated(): boolean {
    if (this.mode === 'local') return true
    const seats = Object.values(this.state.seatMap)
    return seats.includes('red') && seats.includes('black')
  }

  private activeTotalMs(): number | null {
    return this.state.game.turn === 'red' ? this.state.redTotalMs : this.state.blackTotalMs
  }

  /** 计时在「双方就座（本地为开局）」后才开始，避免房主空等被判负。 */
  private maybeStartClock(): void {
    if (!hasClock(this.state.timeControl)) return
    if (this.state.game.status !== 'playing') return
    if (this.state.turnStartedAt != null) return
    if (!this.bothSeated()) return
    const now = Date.now()
    this.update({ turnStartedAt: now, clockNow: now })
  }

  private tickClock(): void {
    if (this.state.game.status !== 'playing') return
    if (!hasClock(this.state.timeControl)) return
    if (this.state.turnStartedAt == null) {
      this.maybeStartClock()
      return
    }
    const now = Date.now()
    const elapsed = now - this.state.turnStartedAt
    const evaluation = evaluateClock(
      this.state.timeControl.perMoveMs,
      this.state.timeControl.totalMs,
      this.activeTotalMs(),
      elapsed,
    )
    if (evaluation.expiredBy) {
      this.handleTimeout(this.state.game.turn, evaluation.expiredBy)
      return
    }
    this.update({ clockNow: now })
  }

  /** 结算走子方总用时并重置本步计时；返回走子方剩余总用时（未启用总用时为 null）。 */
  private applyClockAfterMove(mover: Seat, elapsed: number): number | null {
    if (!hasClock(this.state.timeControl)) return null
    const totalMs = this.state.timeControl.totalMs
    let remain: number | null = null
    if (totalMs != null) {
      const baseline = mover === 'red' ? this.state.redTotalMs : this.state.blackTotalMs
      remain = Math.max(0, (baseline ?? totalMs) - Math.max(0, elapsed))
    }
    const now = Date.now()
    const patch: Partial<SessionState> = { turnStartedAt: now, clockNow: now }
    if (remain != null) {
      if (mover === 'red') patch.redTotalMs = remain
      else patch.blackTotalMs = remain
    }
    this.update(patch)
    return remain
  }

  private handleTimeout(loser: Seat, reason: 'perMove' | 'total'): void {
    if (this.state.game.status !== 'playing') return
    this.update({ endReason: 'timeout' })
    this.setGame({ ...this.state.game, status: statusForTimeout(loser) })
    if (this.mode === 'online') {
      this.send({ t: 'timeout', seat: loser, moveNo: this.state.game.moves.length, reason })
    }
    if (this.mode === 'local') {
      this.notify(loser === 'red' ? '红方超时，黑方胜' : '黑方超时，红方胜')
      return
    }
    if (this.state.seat === loser) {
      this.notify(reason === 'total' ? '总用时用完，你输了' : '本步超时，你输了')
    } else {
      this.notify(reason === 'total' ? '对方总用时用完，你赢了' : '对方超时，你赢了')
    }
  }

  private resetClocks(): void {
    const total = this.state.timeControl.totalMs
    this.update({
      redTotalMs: total,
      blackTotalMs: total,
      turnStartedAt: null,
      clockNow: Date.now(),
      endReason: null,
    })
    this.maybeStartClock()
  }

  private notify(text: string): void {
    this.update({ notice: text })
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => {
      if (this.state.notice === text) this.update({ notice: null })
    }, 4_000)
  }

  private clearPending(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    if (this.state.pending) this.update({ pending: null })
  }

  private schedulePendingTimeout(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = setTimeout(() => {
      if (this.state.pending) {
        this.notify(this.state.pending.incoming ? '请求已超时' : '对方未回应')
        this.update({ pending: null })
      }
    }, 30_000)
  }

  private opponentId(): string | undefined {
    const seat = this.state.seat
    if (!seat) return undefined
    const target = opposite(seat)
    for (const [id, value] of Object.entries(this.state.seatMap)) {
      if (value === target && id !== this.state.clientId) return id
    }
    return undefined
  }

  private hasSeat(seat: Seat): boolean {
    return Object.entries(this.state.seatMap).some(
      ([id, value]) => value === seat && id !== this.state.clientId,
    )
  }

  private setSeatFor(clientId: string, seat: Seat): void {
    if (this.state.seatMap[clientId] === seat) return
    this.update({ seatMap: { ...this.state.seatMap, [clientId]: seat } })
  }

  private mergeName(from: string, name: string): void {
    if (!name || this.state.nameMap[from] === name) return
    this.update({ nameMap: { ...this.state.nameMap, [from]: name } })
  }

  private send(payload: WirePayload): void {
    if (!this.transport) return
    const msg: WireMsg = {
      v: 1,
      room: this.room,
      from: this.state.clientId,
      ts: Date.now(),
      msgId: randomId(),
      ...payload,
    }
    this.transport.send(msg)
  }

  private sendSync(to?: string): void {
    const turnElapsedMs =
      this.state.turnStartedAt != null
        ? Math.max(0, Date.now() - this.state.turnStartedAt)
        : 0
    this.send({
      t: 'sync',
      to,
      moves: this.state.game.moves.map(encodeMove),
      status: this.state.game.status,
      seatMap: { ...this.state.seatMap },
      nameMap: { ...this.state.nameMap },
      timeControl: this.state.timeControl,
      redTotalMs: this.state.redTotalMs,
      blackTotalMs: this.state.blackTotalMs,
      turnElapsedMs,
      endReason: this.state.endReason,
    })
  }

  private announce(): void {
    if (this.mode !== 'online') return
    this.send({
      t: 'hello',
      seat: this.state.seat ?? 'auto',
      moveNo: this.state.game.moves.length,
      name: this.state.name,
    })
    this.send({ t: 'sync-req' })
  }

  private heartbeat(): void {
    if (!this.running || this.mode !== 'online') return
    if (document.visibilityState === 'hidden') return
    if (this.state.conn !== 'connected') return
    this.lastSeen.set(this.state.clientId, Date.now())
    this.send({ t: 'ping' })
  }

  private refreshPresence(): void {
    if (this.mode !== 'online') return
    const opponent = this.opponentId()
    const online = opponent
      ? Date.now() - (this.lastSeen.get(opponent) ?? 0) < 45_000
      : false
    if (online !== this.state.peerOnline) this.update({ peerOnline: online })
  }

  // ----------------------------------------------------------------- messages

  private handleMessage(msg: WireMsg): void {
    if (!msg || msg.room !== this.room || msg.from === this.state.clientId) return
    if (this.seenMessages.has(msg.msgId)) return
    this.seenMessages.add(msg.msgId)
    if (this.seenMessages.size > 800) {
      const first = this.seenMessages.values().next().value
      if (typeof first === 'string') this.seenMessages.delete(first)
    }

    this.lastSeen.set(msg.from, Date.now())
    // 收到对方消息立即视为在线，不必等 5 秒一次的在线状态轮询。
    if (!this.state.peerOnline && msg.from === this.opponentId()) {
      this.update({ peerOnline: true })
    }
    if (msg.t === 'hello') this.mergeName(msg.from, msg.name)
    if (msg.t === 'chat') this.mergeName(msg.from, msg.name)

    switch (msg.t) {
      case 'hello':
        this.onHello(msg)
        break
      case 'seat':
        this.onSeat(msg)
        break
      case 'move':
        this.onMove(msg)
        break
      case 'sync-req':
        if (!msg.to || msg.to === this.state.clientId) this.sendSync(msg.from)
        break
      case 'sync':
        this.onSync(msg)
        break
      case 'undo-req':
        this.onUndoRequest(msg)
        break
      case 'undo-res':
        this.onUndoResponse(msg)
        break
      case 'draw-req':
        this.onDrawRequest(msg)
        break
      case 'draw-res':
        this.onDrawResponse(msg)
        break
      case 'resign':
        this.onResign(msg)
        break
      case 'timeout':
        this.onTimeout(msg)
        break
      case 'rematch-req':
        this.onRematchRequest(msg)
        break
      case 'rematch-res':
        this.onRematchResponse(msg)
        break
      case 'chat':
        this.onChatMessage(msg)
        break
      case 'ping':
        this.send({ t: 'pong' })
        break
      case 'pong':
        break
    }
  }

  private onHello(msg: Extract<WireMsg, { t: 'hello' }>): void {
    if (isSeat(msg.seat)) {
      const taken = Object.entries(this.state.seatMap).find(
        ([id, seat]) => seat === msg.seat && id !== msg.from,
      )
      if (taken) {
        if (this.state.seat === 'red') {
          this.send({ t: 'seat', seat: null, to: msg.from })
        }
      } else {
        this.setSeatFor(msg.from, msg.seat)
      }
    } else if (this.state.seat === 'red') {
      // 房主（红方）负责给新加入者分配黑方座位。
      const existing = this.state.seatMap[msg.from]
      if (existing) {
        // 重发座位：对方可能因重连错过了第一次 seat 消息。
        this.send({ t: 'seat', seat: existing, to: msg.from })
      } else if (!this.hasSeat('black')) {
        this.setSeatFor(msg.from, 'black')
        this.send({ t: 'seat', seat: 'black', to: msg.from })
        this.notify(`${msg.name || '对方'} 加入了房间`)
      } else {
        this.send({ t: 'seat', seat: null, to: msg.from })
      }
    }

    if (this.state.game.moves.length >= msg.moveNo) {
      this.sendSync(msg.from)
    } else {
      this.send({ t: 'sync-req', to: msg.from })
    }
    this.maybeStartClock()
  }

  private onSeat(msg: Extract<WireMsg, { t: 'seat' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (msg.seat === null) {
      this.notify('房间已满，当前只能等待')
      return
    }
    if (this.state.seat && this.state.seat !== msg.seat) return
    this.update({
      seat: msg.seat,
      seatMap: { ...this.state.seatMap, [this.state.clientId]: msg.seat },
    })
    this.notify(msg.seat === 'red' ? '你执红先行' : '你执黑后行')
    this.send({
      t: 'hello',
      seat: msg.seat,
      moveNo: this.state.game.moves.length,
      name: this.state.name,
    })
    this.send({ t: 'sync-req' })
    this.persist()
    this.maybeStartClock()
  }

  private onMove(msg: Extract<WireMsg, { t: 'move' }>): void {
    const senderSeat = this.state.seatMap[msg.from]
    if (!senderSeat || senderSeat !== this.state.game.turn) return

    if (msg.moveNo !== this.state.game.moves.length) {
      if (msg.moveNo > this.state.game.moves.length) {
        this.send({ t: 'sync-req', to: msg.from })
      }
      return
    }

    try {
      const next = applyMove(this.state.game, decodeMove(msg.move))
      this.setGame(next)
      if (hasClock(this.state.timeControl)) {
        const now = Date.now()
        const patch: Partial<SessionState> = { turnStartedAt: now, clockNow: now }
        if (
          this.state.timeControl.totalMs != null &&
          typeof msg.clockMs === 'number'
        ) {
          if (senderSeat === 'red') patch.redTotalMs = msg.clockMs
          else patch.blackTotalMs = msg.clockMs
        }
        this.update(patch)
      }
      if (this.state.pending && !this.state.pending.incoming) {
        this.clearPending()
      }
    } catch {
      this.send({ t: 'sync-req', to: msg.from })
    }
  }

  private onSync(msg: Extract<WireMsg, { t: 'sync' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return

    let replayed: GameState
    try {
      replayed = replayGame(msg.moves)
    } catch {
      this.send({ t: 'sync-req', to: msg.from })
      return
    }

    let status: GameStatus = replayed.status
    if (msg.status !== 'playing') status = msg.status
    // 本地已经终局时，不被过时的「进行中」同步复活。
    if (this.state.game.status !== 'playing' && status === 'playing') {
      status = this.state.game.status
    }

    const incoming: GameState = { ...replayed, status }
    const myLen = this.state.game.moves.length
    const incomingLen = msg.moves.length
    const sameLen = incomingLen === myLen
    const diverged = sameLen && toFenOf(replayed) !== toFenOf(this.state.game)

    const adopt =
      incomingLen > myLen ||
      (diverged && msg.from < this.state.clientId) ||
      (sameLen &&
        status !== this.state.game.status &&
        (status !== 'playing' || msg.from < this.state.clientId))

    if (adopt) {
      this.update({ game: incoming })
      if (status !== 'playing') this.clearPending()
      else if (this.state.pending && !this.state.pending.incoming && incomingLen !== myLen) {
        this.clearPending()
      }
      this.persist()
    } else if (incomingLen < myLen) {
      this.sendSync(msg.from)
    }

    const seatMap: Record<string, Seat> = {
      ...this.state.seatMap,
      ...msg.seatMap,
    }
    if (this.state.seat) seatMap[this.state.clientId] = this.state.seat
    const nameMap: Record<string, string> = { ...this.state.nameMap, ...msg.nameMap }
    nameMap[this.state.clientId] = this.state.name
    // 如果错过了 seat 消息，仍可从对方的座位表认领自己的座位。
    const hadSeat = this.state.seat !== null
    const adoptedSeat = this.state.seat ?? seatMap[this.state.clientId] ?? null
    this.update({ seatMap, nameMap, seat: adoptedSeat })
    if (!hadSeat && adoptedSeat) {
      this.notify(adoptedSeat === 'red' ? '你执红先行' : '你执黑后行')
      this.persist()
    }

    // 采纳对方的计时配置与时钟（仅房主/红方为权威来源，且局面不落后）。
    const syncSenderSeat = this.state.seatMap[msg.from]
    if (
      msg.timeControl !== undefined &&
      incomingLen >= myLen &&
      syncSenderSeat === 'red'
    ) {
      const tc = msg.timeControl ?? TIME_CONTROL_OFF
      const elapsed =
        typeof msg.turnElapsedMs === 'number' ? Math.max(0, msg.turnElapsedMs) : 0
      const patch: Partial<SessionState> = { timeControl: tc, clockNow: Date.now() }
      if (tc.totalMs != null) {
        patch.redTotalMs =
          typeof msg.redTotalMs === 'number' ? msg.redTotalMs : tc.totalMs
        patch.blackTotalMs =
          typeof msg.blackTotalMs === 'number' ? msg.blackTotalMs : tc.totalMs
      } else {
        patch.redTotalMs = null
        patch.blackTotalMs = null
      }
      if (status !== 'playing') {
        patch.turnStartedAt = null
        patch.endReason = msg.endReason ?? null
      } else {
        patch.endReason = null
        if (hasClock(tc) && (adopt || (incomingLen === myLen && !diverged))) {
          patch.turnStartedAt = Date.now() - elapsed
        }
      }
      this.update(patch)
    }
    this.maybeStartClock()
  }

  private onUndoRequest(msg: Extract<WireMsg, { t: 'undo-req' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (!this.state.seat || this.state.game.status !== 'playing') {
      this.send({
        t: 'undo-res',
        to: msg.from,
        accept: false,
        targetMoveNo: msg.targetMoveNo,
      })
      return
    }

    const requesterSeat = this.state.seatMap[msg.from]
    const lastMover = opposite(this.state.game.turn)
    const valid =
      requesterSeat === lastMover &&
      msg.targetMoveNo === this.state.game.moves.length - 1 &&
      this.state.pending === null

    if (!valid) {
      this.send({
        t: 'undo-res',
        to: msg.from,
        accept: false,
        targetMoveNo: msg.targetMoveNo,
      })
      return
    }

    this.update({
      pending: {
        kind: 'undo',
        from: msg.from,
        name: this.state.nameMap[msg.from] ?? '对方',
        incoming: true,
        targetMoveNo: msg.targetMoveNo,
      },
    })
    this.schedulePendingTimeout()
  }

  private onUndoResponse(msg: Extract<WireMsg, { t: 'undo-res' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (msg.accept) {
      if (msg.targetMoveNo === this.state.game.moves.length - 1) {
        this.truncateTo(msg.targetMoveNo)
      }
      this.notify('对方同意悔棋')
    } else {
      this.notify('对方拒绝悔棋')
    }
    this.clearPending()
  }

  private onDrawRequest(msg: Extract<WireMsg, { t: 'draw-req' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (this.state.game.status !== 'playing' || !this.state.seat) return
    if (this.state.pending) {
      this.send({ t: 'draw-res', to: msg.from, accept: false })
      return
    }
    this.update({
      pending: {
        kind: 'draw',
        from: msg.from,
        name: this.state.nameMap[msg.from] ?? '对方',
        incoming: true,
      },
    })
    this.schedulePendingTimeout()
  }

  private onDrawResponse(msg: Extract<WireMsg, { t: 'draw-res' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (msg.accept) {
      this.update({ endReason: 'draw' })
      this.setGame({ ...this.state.game, status: 'draw' })
      this.notify('双方同意和棋')
    } else {
      this.notify('对方拒绝和棋')
    }
    this.clearPending()
  }

  private onResign(msg: Extract<WireMsg, { t: 'resign' }>): void {
    const senderSeat = this.state.seatMap[msg.from]
    if (!senderSeat) return
    const status: GameStatus = senderSeat === 'red' ? 'black_wins' : 'red_wins'
    this.update({ endReason: 'resign' })
    this.setGame({ ...this.state.game, status })
    this.notify('对方认输，你赢了')
  }

  private onTimeout(msg: Extract<WireMsg, { t: 'timeout' }>): void {
    if (this.state.game.status !== 'playing') return
    if (msg.moveNo !== this.state.game.moves.length) return
    // 只接受“当前行棋方超时”的声明，任意已就座玩家都可广播同一结果。
    if (msg.seat !== this.state.game.turn) return
    if (!this.state.seatMap[msg.from]) return
    this.update({ endReason: 'timeout' })
    this.setGame({ ...this.state.game, status: statusForTimeout(msg.seat) })
    this.notify(this.state.seat === msg.seat ? '你超时了' : '对方超时，你赢了')
  }

  private onRematchRequest(msg: Extract<WireMsg, { t: 'rematch-req' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (this.state.game.status === 'playing' || !this.state.seat) return
    if (this.state.pending) {
      this.send({ t: 'rematch-res', to: msg.from, accept: false })
      return
    }
    this.update({
      pending: {
        kind: 'rematch',
        from: msg.from,
        name: this.state.nameMap[msg.from] ?? '对方',
        incoming: true,
      },
    })
    this.schedulePendingTimeout()
  }

  private onRematchResponse(msg: Extract<WireMsg, { t: 'rematch-res' }>): void {
    if (msg.to && msg.to !== this.state.clientId) return
    if (msg.accept) {
      // 防止迟到的响应把已经重新开始的对局再次清空。
      if (this.state.game.status !== 'playing') {
        this.setGame(createGame())
        this.resetClocks()
        this.notify('新的一局开始')
      }
    } else {
      this.notify('对方拒绝再来一局')
    }
    this.clearPending()
  }

  private onChatMessage(msg: Extract<WireMsg, { t: 'chat' }>): void {
    const text = msg.text.trim().slice(0, 200)
    if (!text) return
    this.appendChat({
      id: msg.msgId,
      from: msg.from,
      name: msg.name || this.state.nameMap[msg.from] || '对方',
      text,
      ts: msg.ts,
      seat: this.state.seatMap[msg.from] ?? null,
    })
  }

  private appendChat(message: ChatMessage): void {
    const chat = [...this.state.chat, message].slice(-200)
    this.update({ chat })
  }

  private truncateTo(moveNo: number): void {
    const codes = this.state.game.moves.slice(0, moveNo).map(encodeMove)
    this.setGame(replayGame(codes))
    // 悔棋后轮到原走子方，本步计时重置（总用时按现状不退还）。
    if (this.state.game.status === 'playing' && hasClock(this.state.timeControl)) {
      const now = Date.now()
      this.update({ turnStartedAt: now, clockNow: now })
    }
  }

  // ------------------------------------------------------------------ actions

  playMove(from: number, to: number): { ok: boolean; reason?: string } {
    if (this.state.game.status !== 'playing') {
      return { ok: false, reason: '对局已结束' }
    }
    if (this.mode === 'online') {
      if (!this.state.seat) return { ok: false, reason: '你还没有座位' }
      if (this.state.seat !== this.state.game.turn) {
        return { ok: false, reason: '还没轮到你走棋' }
      }
    }

    const elapsed = this.state.turnStartedAt != null ? Date.now() - this.state.turnStartedAt : 0
    if (hasClock(this.state.timeControl) && this.state.turnStartedAt != null) {
      const evaluation = evaluateClock(
        this.state.timeControl.perMoveMs,
        this.state.timeControl.totalMs,
        this.activeTotalMs(),
        elapsed,
      )
      if (evaluation.expiredBy) {
        this.handleTimeout(this.state.game.turn, evaluation.expiredBy)
        return { ok: false, reason: '超时判负' }
      }
    }

    let next: GameState
    try {
      next = applyMove(this.state.game, { from, to })
    } catch {
      return { ok: false, reason: '这步棋不能走' }
    }

    const mover = this.state.game.turn
    const moveNo = this.state.game.moves.length
    const clockMs = this.applyClockAfterMove(mover, elapsed)
    this.setGame(next)
    if (this.mode === 'online') {
      this.send({ t: 'move', move: encodeMove({ from, to }), moveNo, clockMs })
      if (this.state.pending && !this.state.pending.incoming) this.clearPending()
    }
    return { ok: true }
  }

  requestUndo(): void {
    if (this.state.game.status !== 'playing') return
    if (this.state.game.moves.length === 0) {
      this.notify('还没有落子')
      return
    }

    if (this.mode === 'local') {
      this.truncateTo(this.state.game.moves.length - 1)
      return
    }

    if (!this.state.seat) {
      this.notify('你还没有座位')
      return
    }
    if (this.state.seat === this.state.game.turn) {
      this.notify('只能悔自己刚走的一步')
      return
    }
    if (this.state.pending) {
      this.notify('已有待处理的请求')
      return
    }

    const targetMoveNo = this.state.game.moves.length - 1
    this.send({ t: 'undo-req', to: this.opponentId(), targetMoveNo })
    this.update({
      pending: {
        kind: 'undo',
        from: this.state.clientId,
        name: this.state.name,
        incoming: false,
        targetMoveNo,
      },
    })
    this.schedulePendingTimeout()
    this.notify('已发送悔棋请求')
  }

  acceptPending(): void {
    const pending = this.state.pending
    if (!pending || !pending.incoming) return

    if (pending.kind === 'undo' && pending.targetMoveNo !== undefined) {
      const target = pending.targetMoveNo
      if (this.state.game.moves.length !== target + 1) {
        this.send({ t: 'undo-res', to: pending.from, accept: false, targetMoveNo: target })
        this.clearPending()
        this.notify('对方已经落子，悔棋请求失效')
        return
      }
      this.truncateTo(target)
      this.send({ t: 'undo-res', to: pending.from, accept: true, targetMoveNo: target })
      this.clearPending()
      this.notify('已同意悔棋')
      return
    }

    if (pending.kind === 'draw') {
      this.update({ endReason: 'draw' })
      this.setGame({ ...this.state.game, status: 'draw' })
      this.send({ t: 'draw-res', to: pending.from, accept: true })
      this.clearPending()
      this.notify('双方同意和棋')
      return
    }

    if (pending.kind === 'rematch') {
      if (this.state.game.status !== 'playing') {
        this.setGame(createGame())
        this.resetClocks()
        this.notify('新的一局开始')
      }
      this.send({ t: 'rematch-res', to: pending.from, accept: true })
      this.clearPending()
    }
  }

  rejectPending(): void {
    const pending = this.state.pending
    if (!pending || !pending.incoming) return
    if (pending.kind === 'undo' && pending.targetMoveNo !== undefined) {
      this.send({
        t: 'undo-res',
        to: pending.from,
        accept: false,
        targetMoveNo: pending.targetMoveNo,
      })
    } else if (pending.kind === 'draw') {
      this.send({ t: 'draw-res', to: pending.from, accept: false })
    } else if (pending.kind === 'rematch') {
      this.send({ t: 'rematch-res', to: pending.from, accept: false })
    }
    this.clearPending()
  }

  cancelPending(): void {
    if (this.state.pending && this.state.pending.incoming) this.rejectPending()
    else this.clearPending()
  }

  requestDraw(): void {
    if (this.state.game.status !== 'playing') return
    if (this.mode === 'local') {
      this.notify('本地双人模式不需要求和')
      return
    }
    if (!this.state.seat) return
    if (this.state.pending) {
      this.notify('已有待处理的请求')
      return
    }
    this.send({ t: 'draw-req', to: this.opponentId() })
    this.update({
      pending: {
        kind: 'draw',
        from: this.state.clientId,
        name: this.state.name,
        incoming: false,
      },
    })
    this.schedulePendingTimeout()
    this.notify('已发送求和请求')
  }

  resign(): void {
    if (this.state.game.status !== 'playing') return
    if (this.mode === 'local' || !this.state.seat) {
      this.notify('本地双人模式不需要认输')
      return
    }
    const status: GameStatus = this.state.seat === 'red' ? 'black_wins' : 'red_wins'
    this.update({ endReason: 'resign' })
    this.setGame({ ...this.state.game, status })
    this.send({ t: 'resign' })
    this.notify('你认输了')
  }

  requestRematch(): void {
    if (this.state.game.status === 'playing') {
      this.notify('对局还没结束')
      return
    }
    if (this.mode === 'local') {
      this.setGame(createGame())
      this.resetClocks()
      return
    }
    if (!this.state.seat) return
    if (this.state.pending) {
      this.notify('已有待处理的请求')
      return
    }
    this.send({ t: 'rematch-req', to: this.opponentId() })
    this.update({
      pending: {
        kind: 'rematch',
        from: this.state.clientId,
        name: this.state.name,
        incoming: false,
      },
    })
    this.schedulePendingTimeout()
    this.notify('已发送再来一局请求')
  }

  sendChat(text: string): void {
    const trimmed = text.trim().slice(0, 200)
    if (!trimmed || this.mode !== 'online') return
    const now = Date.now()
    if (now - this.lastChatAt < 700) return
    this.lastChatAt = now
    this.send({ t: 'chat', text: trimmed, name: this.state.name })
    this.appendChat({
      id: randomId(),
      from: this.state.clientId,
      name: this.state.name,
      text: trimmed,
      ts: now,
      seat: this.state.seat,
    })
  }

  dismissNotice(): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    if (this.state.notice) this.update({ notice: null })
  }

  notifyUser(text: string): void {
    this.notify(text)
  }

  setViewName(name: string): void {
    const trimmed = name.trim().slice(0, 16) || '玩家'
    if (trimmed === this.state.name) return
    this.update({
      name: trimmed,
      nameMap: { ...this.state.nameMap, [this.state.clientId]: trimmed },
    })
    saveName(trimmed)
    this.persist()
    if (this.mode === 'online') {
      this.send({
        t: 'hello',
        seat: this.state.seat ?? 'auto',
        moveNo: this.state.game.moves.length,
        name: trimmed,
      })
    }
  }
}
