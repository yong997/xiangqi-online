import { useEffect, useMemo, useRef, useState } from 'react'
import { applyMove, createGame, legalMovesFor } from '../game/engine'
import {
  applyJieqiMove,
  createJieqiGame,
  jieqiIsInCheck,
  jieqiLegalMovesFrom,
  jieqiMoveToChinese,
} from '../game/jieqi'
import { moveToChinese } from '../game/notation'
import { isInCheck } from '../game/rules'
import type { Color, GameState, GameVariant, Square } from '../game/types'
import { formatClock, hasClock } from '../net/clock'
import { inviteLink } from '../net/room'
import type { ChatMessage, SessionController, SessionState } from '../net/session'
import { Board } from './Board'
import { ChatPanel } from './ChatPanel'
import { Modal } from './Modal'
import { playSfx } from './sound'

interface GameScreenProps {
  session: SessionController
  state: SessionState
  onLeave: () => void
}

interface HistoryItem {
  no: number
  color: Color
  text: string
}

function buildHistory(game: GameState, variant: GameVariant, seed: number): HistoryItem[] {
  let state = variant === 'jieqi' ? createJieqiGame(seed) : createGame()
  const items: HistoryItem[] = []
  for (const move of game.moves) {
    const color = state.turn
    const text =
      variant === 'jieqi' ? jieqiMoveToChinese(state.board, move) : moveToChinese(state.board, move)
    items.push({ no: items.length + 1, color, text })
    state = variant === 'jieqi' ? applyJieqiMove(state, move) : applyMove(state, move)
  }
  return items
}

function seatOwner(
  state: SessionState,
  seat: Color,
): { id: string; name: string; isMe: boolean } | null {
  for (const [id, value] of Object.entries(state.seatMap)) {
    if (value === seat) {
      return {
        id,
        name: state.nameMap[id] || (seat === 'red' ? '红方' : '黑方'),
        isMe: id === state.clientId,
      }
    }
  }
  return null
}

function resultText(state: SessionState): { title: string; detail: string } {
  const status = state.game.status
  if (status === 'draw') {
    return {
      title: '和棋',
      detail:
        state.endReason === 'draw'
          ? '双方同意和棋'
          : state.endReason === 'natural_draw'
            ? '三次重复或 60 回合无吃子，判和'
            : '和棋',
    }
  }
  if (status === 'red_wins' || status === 'black_wins') {
    const winner: Color = status === 'red_wins' ? 'red' : 'black'
    let detail = winner === 'red' ? '红方获胜' : '黑方获胜'
    if (state.endReason === 'timeout') {
      detail = winner === 'red' ? '黑方超时，红方胜' : '红方超时，黑方胜'
    } else if (state.endReason === 'checkmate') {
      detail = winner === 'red' ? '红方将死黑方' : '黑方将死红方'
    } else if (state.endReason === 'stalemate') {
      detail = winner === 'red' ? '黑方困毙，红方胜' : '红方困毙，黑方胜'
    }
    let title: string
    if (state.mode === 'online' && state.seat) {
      if (state.endReason === 'timeout') {
        title = state.seat === winner ? '对方超时，你赢了' : '你超时了'
      } else if (state.endReason === 'checkmate') {
        title = state.seat === winner ? '绝杀！你赢了' : '被将死，你输了'
      } else if (state.endReason === 'stalemate') {
        title = state.seat === winner ? '对方困毙，你赢了' : '你被困毙了'
      } else {
        title = state.seat === winner ? '你赢了' : '你输了'
      }
    } else if (state.endReason === 'checkmate') {
      title = winner === 'red' ? '红方绝杀' : '黑方绝杀'
    } else if (state.endReason === 'stalemate') {
      title = winner === 'red' ? '红方胜（困毙）' : '黑方胜（困毙）'
    } else {
      title = winner === 'red' ? '红方胜' : '黑方胜'
    }
    return { title, detail }
  }
  return { title: '', detail: '' }
}

function ClockBar({ state }: { state: SessionState }) {
  const tc = state.timeControl
  if (!hasClock(tc) || state.game.status !== 'playing') return null
  const now = state.clockNow || Date.now()
  const running =
    state.turnStartedAt != null ? Math.max(0, now - state.turnStartedAt) : 0
  const elapsed = state.turnElapsedMs + running
  const started = state.turnStartedAt != null || state.turnElapsedMs > 0 || state.clockPaused
  const active = state.game.turn
  const red =
    state.redTotalMs != null
      ? Math.max(0, state.redTotalMs - (active === 'red' ? elapsed : 0))
      : null
  const black =
    state.blackTotalMs != null
      ? Math.max(0, state.blackTotalMs - (active === 'black' ? elapsed : 0))
      : null
  const perMove = tc.perMoveMs != null ? Math.max(0, tc.perMoveMs - elapsed) : null
  const level = (ms: number | null) =>
    ms == null ? '' : ms <= 10_000 ? ' is-danger' : ms <= 30_000 ? ' is-warning' : ''
  const display = (ms: number | null) =>
    !started || ms == null ? '--:--' : formatClock(ms)

  return (
    <div className={`clock-bar${state.clockPaused ? ' is-paused' : ''}`} role="status">
      {red != null && (
        <span className={`clock-side red${active === 'red' ? ' is-active' : ''}${level(red)}`}>
          <span className="clock-side-name">红方</span>
          <span className="clock-side-time">{display(red)}</span>
        </span>
      )}
      {perMove != null && (
        <span className={`clock-move${level(perMove)}`}>
          <span className="clock-move-label">本步</span>
          <span className="clock-move-time">{display(perMove)}</span>
        </span>
      )}
      {black != null && (
        <span className={`clock-side black${active === 'black' ? ' is-active' : ''}${level(black)}`}>
          <span className="clock-side-name">黑方</span>
          <span className="clock-side-time">{display(black)}</span>
        </span>
      )}
      {state.clockPaused && <span className="clock-paused-tag">已暂停</span>}
    </div>
  )
}

function StatusLine({ state }: { state: SessionState }) {
  const game = state.game
  if (game.status !== 'playing') {
    const result = resultText(state)
    return (
      <div className="status-card status-finished">
        <span className="status-kicker">
          对局结束{state.variant === 'jieqi' ? ' · 揭棋' : ''}
        </span>
        <strong>{result.title}</strong>
        <span className="status-detail">{result.detail}</span>
      </div>
    )
  }

  let title = ''
  let detail = ''

  if (state.mode === 'local') {
    title = game.turn === 'red' ? '红方走棋' : '黑方走棋'
    detail = '同一台设备轮流走棋'
  } else if (!state.seat) {
    title = '等待入座'
    detail = '等待房主分配红黑方'
  } else if (state.conn !== 'connected') {
    title = state.conn === 'connecting' ? '正在连接…' : '连接已断开'
    detail = '网络恢复后会自动重连'
  } else if (!state.peerOnline) {
    title = '等待对方上线'
    detail = '把邀请链接发给朋友即可开始'
  } else if (game.turn === state.seat) {
    title = '轮到你走棋'
    detail = state.seat === 'red' ? '你执红先行' : '你执黑后行'
  } else {
    title = '等待对方走棋'
    detail = state.seat === 'red' ? '你执红' : '你执黑'
  }

  return (
    <div className={`status-card ${game.turn === state.seat ? 'your-turn' : ''}`}>
      <span className="status-kicker">
        {state.mode === 'local' ? '本地双人' : '对局中'}
        {state.variant === 'jieqi' ? ' · 揭棋' : ''}
      </span>
      <strong>{title}</strong>
      <span className="status-detail">{detail}</span>
    </div>
  )
}

function PlayerRow({
  state,
  color,
}: {
  state: SessionState
  color: Color
}) {
  const owner = seatOwner(state, color)
  const active = state.game.status === 'playing' && state.game.turn === color
  const online =
    state.mode === 'local' ? true : owner ? (owner.isMe ? true : state.peerOnline) : false

  return (
    <div className={`player-row ${active ? 'active' : ''}`}>
      <span className={`player-dot ${color}`} />
      <div className="player-text">
        <strong>
          {owner?.name ?? (color === 'red' ? '红方' : '黑方')}
          {owner?.isMe ? '（你）' : ''}
        </strong>
        <small>{color === 'red' ? '红方 · 先手' : '黑方 · 后手'}</small>
      </div>
      <span className={`presence ${online ? 'online' : 'offline'}`}>
        {state.mode === 'local' ? '本机' : owner ? (online ? '在线' : '离线') : '空位'}
      </span>
    </div>
  )
}

export function GameScreen({ session, state, onLeave }: GameScreenProps) {
  const game = state.game
  const [selected, setSelected] = useState<Square | null>(null)
  const [viewColor, setViewColor] = useState<Color>(
    state.mode === 'online' && state.seat ? state.seat : 'red',
  )
  const [chatOpen, setChatOpen] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [resultDismissed, setResultDismissed] = useState(false)
  const [checkmateFx, setCheckmateFx] = useState(false)
  const [chatPing, setChatPing] = useState<ChatMessage | null>(null)
  const [unread, setUnread] = useState(0)
  const seenIncomingRef = useRef<Set<string>>(new Set())
  const prevMoveCountRef = useRef(game.moves.length)
  const prevStatusRef = useRef(game.status)

  useEffect(() => {
    if (state.seat) setViewColor(state.seat)
  }, [state.seat])

  useEffect(() => {
    setSelected(null)
  }, [game.turn, game.status])

  useEffect(() => {
    if (game.status === 'playing') setResultDismissed(false)
  }, [game.status])

  // 每走一步播放落子音效；若走完后对方被将军，再叠加将军提示音。
  useEffect(() => {
    const prev = prevMoveCountRef.current
    const count = game.moves.length
    prevMoveCountRef.current = count
    if (count <= prev) return
    playSfx('move')
    const checked =
      state.variant === 'jieqi'
        ? jieqiIsInCheck(game.board, game.turn)
        : isInCheck(game.board, game.turn)
    // 绝杀（将死）时只播放绝杀特效音，不再叠加「将军」语音。
    if (checked && game.status === 'playing') {
      const timer = window.setTimeout(() => playSfx('check'), 180)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [game.moves.length, game.board, game.turn, game.status, state.variant])

  // 将死（绝杀）时播放全屏庆祝特效 + 冲击音效。
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = game.status
    if (prev === 'playing' && game.status !== 'playing' && state.endReason === 'checkmate') {
      setCheckmateFx(true)
      playSfx('checkmate')
      const timer = window.setTimeout(() => setCheckmateFx(false), 2300)
      return () => window.clearTimeout(timer)
    }
    if (game.status === 'playing') setCheckmateFx(false)
    return undefined
  }, [game.status, state.endReason])

  // 收到对方的新聊天消息时，在棋盘上弹出一条浮层提醒；聊天面板打开时不再打扰。
  useEffect(() => {
    const incoming = state.chat.filter(
      (message) => message.from !== state.clientId && !seenIncomingRef.current.has(message.id),
    )
    if (incoming.length === 0) return
    for (const message of incoming) seenIncomingRef.current.add(message.id)
    if (chatOpen) return
    setUnread((count) => count + incoming.length)
    setChatPing(incoming[incoming.length - 1])
  }, [state.chat, state.clientId, chatOpen])

  // 打开聊天后清空未读与浮层提醒
  useEffect(() => {
    if (!chatOpen) return
    setUnread(0)
    setChatPing(null)
  }, [chatOpen])

  // 浮层提醒自动消失
  useEffect(() => {
    if (!chatPing) return
    const timer = setTimeout(() => setChatPing(null), 6000)
    return () => clearTimeout(timer)
  }, [chatPing])

  const legal = useMemo(
    () =>
      selected === null
        ? []
        : state.variant === 'jieqi'
          ? jieqiLegalMovesFrom(game, selected)
          : legalMovesFor(game, selected),
    [game, selected, state.variant],
  )

  const canPlay =
    game.status === 'playing' &&
    (state.mode === 'local' ||
      (state.conn === 'connected' && state.seat !== null && state.seat === game.turn))

  const history = useMemo(
    () => buildHistory(game, state.variant, state.seed),
    [game, state.variant, state.seed],
  )
  const visibleHistory = history.slice(-18)
  const lastMove = history.length > 0 ? history[history.length - 1] : null
  const lastMoveIsOpponent =
    state.mode === 'online' &&
    state.seat !== null &&
    lastMove !== null &&
    lastMove.color !== state.seat
  const result = resultText(state)
  const pendingIncoming = state.pending?.incoming ? state.pending : null

  const handleSelect = (square: Square) => {
    if (square < 0) {
      setSelected(null)
      return
    }
    if (!canPlay) return

    if (selected !== null && legal.includes(square)) {
      const outcome = session.playMove(selected, square)
      if (outcome.ok) setSelected(null)
      else session.notifyUser(outcome.reason ?? '这步棋不能走')
      return
    }

    const piece = game.board[square]
    const controllable =
      piece &&
      (state.mode === 'local' ? piece.color === game.turn : piece.color === state.seat)
    setSelected(controllable ? square : null)
  }

  const copyInvite = async () => {
    const link = inviteLink(state.room, state.variant)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(link)
      session.notifyUser('邀请链接已复制，发给朋友即可')
    } catch {
      window.prompt('复制下面的邀请链接发给朋友：', link)
    }
  }

  const undoDisabled =
    game.status !== 'playing' ||
    game.moves.length === 0 ||
    (state.mode === 'online' &&
      (!state.seat || state.seat === game.turn || Boolean(state.pending)))

  const drawDisabled =
    state.mode === 'local' || game.status !== 'playing' || !state.seat || Boolean(state.pending)

  const resignDisabled = state.mode === 'local' || game.status !== 'playing' || !state.seat

  const pendingLabel =
    pendingIncoming?.kind === 'undo'
      ? '悔棋'
      : pendingIncoming?.kind === 'draw'
        ? '求和'
        : '再来一局'

  return (
    <div className="game">
      <header className="game-header">
        <button type="button" className="icon-btn" onClick={onLeave} aria-label="返回大厅">
          ‹
        </button>

        <div className="room-title">
          {state.mode === 'online' ? (
            <>
              <span className="room-label">房间</span>
              <code className="room-code">{state.room}</code>
              <button type="button" className="btn btn-ghost btn-xs" onClick={copyInvite}>
                复制邀请链接
              </button>
            </>
          ) : (
            <span className="room-label">本地双人</span>
          )}
        </div>

        <div className="header-actions">
          {state.mode === 'online' && (
            <span className={`conn-badge conn-${state.conn}`}>
              <span className="dot" />
              {state.transportMode === 'local'
                ? '本地联机'
                : state.conn === 'connected'
                  ? '已连接'
                  : state.conn === 'connecting'
                    ? '连接中'
                    : '已断开'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setViewColor((current) => (current === 'red' ? 'black' : 'red'))}
          >
            翻转棋盘
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs mobile-only"
            onClick={() => setChatOpen(true)}
          >
            聊天
            {unread > 0 && <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        </div>
      </header>

      {state.mode === 'online' && state.transportMode === 'local' && (
        <div className="mode-banner">
          未配置 GoEasy：当前是本地联机模式，请在同一浏览器的另一个标签页打开邀请链接。
        </div>
      )}

      {state.mode === 'online' && state.seat && !state.peerOnline && game.status === 'playing' && (
        <div className="mode-banner warn">
          {hasClock(state.timeControl)
            ? '对方离线，计时已暂停，等待对方重连。'
            : '对方暂时离线，棋局已保存，等待重连。'}
        </div>
      )}

      <main className="game-body">
        <section className="board-column">
          <ClockBar state={state} />
          {lastMove && (
            <div className={`last-move-cue${lastMoveIsOpponent ? ' is-opponent' : ''}`}>
              <span className="last-move-cue-label">
                {lastMoveIsOpponent ? '对方上一步' : '上一步'}
              </span>
              <span className={`last-move-cue-side ${lastMove.color}`}>
                {lastMove.color === 'red' ? '红方' : '黑方'}
              </span>
              <span className="last-move-cue-text">{lastMove.text}</span>
            </div>
          )}

          <div className="board-stage">
            <Board
              game={game}
              variant={state.variant}
              viewColor={viewColor}
              selected={selected}
              legal={legal}
              interactive={canPlay}
              onSelect={handleSelect}
            />

            {chatPing && (
              <button
                type="button"
                className="chat-ping"
                onClick={() => {
                  setChatPing(null)
                  setChatOpen(true)
                }}
              >
                <span className="chat-ping-avatar">{chatPing.name.slice(0, 1)}</span>
                <span className="chat-ping-main">
                  <span className="chat-ping-name">{chatPing.name}</span>
                  <span className="chat-ping-text">{chatPing.text}</span>
                </span>
                <span className="chat-ping-hint">查看</span>
              </button>
            )}
          </div>

          <div className="mobile-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => session.requestUndo()}
              disabled={undoDisabled}
            >
              悔棋
            </button>
            {state.mode === 'online' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => session.requestDraw()}
                  disabled={drawDisabled}
                >
                  求和
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setConfirmResign(true)}
                  disabled={resignDisabled}
                >
                  认输
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="side-panel">
          <StatusLine state={state} />

          <section className="panel players-panel">
            <PlayerRow state={state} color="red" />
            <PlayerRow state={state} color="black" />
          </section>

          <section className="panel actions-panel">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => session.requestUndo()}
              disabled={undoDisabled}
            >
              悔棋
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => session.requestDraw()}
              disabled={drawDisabled}
            >
              求和
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmResign(true)}
              disabled={resignDisabled}
            >
              认输
            </button>
            {game.status !== 'playing' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => session.requestRematch()}
              >
                再来一局
              </button>
            )}
          </section>

          {state.pending && !state.pending.incoming && (
            <div className="pending-banner">
              已发送{pendingLabel === '再来一局' ? '再来一局' : pendingLabel}请求，等待对方回应…
              <button type="button" className="link-btn" onClick={() => session.cancelPending()}>
                取消
              </button>
            </div>
          )}

          <section className="panel history-panel">
            <header className="panel-header">
              <h2>棋谱</h2>
              <span className="muted">{history.length} 手</span>
            </header>
            {visibleHistory.length === 0 ? (
              <p className="empty-hint">红方先行，点击棋子开始对局。</p>
            ) : (
              <ol className="move-list">
                {visibleHistory.map((item) => (
                  <li key={item.no} className={item.color}>
                    <span className="move-no">{item.no}</span>
                    <span className="move-text">{item.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {state.mode === 'online' && (
            <div className="desktop-chat">
              <ChatPanel
                messages={state.chat}
                onSend={(text) => session.sendChat(text)}
                disabled={state.conn !== 'connected'}
                selfId={state.clientId}
              />
            </div>
          )}
        </aside>
      </main>

      {state.notice && (
        <button type="button" className="toast" onClick={() => session.dismissNotice()}>
          {state.notice}
        </button>
      )}

      {checkmateFx && (
        <div className="checkmate-fx" aria-hidden="true">
          <div className="checkmate-flash" />
          <div className="checkmate-rays" />
          <div className="checkmate-title">绝杀</div>
          <div className="checkmate-subtitle">将 死</div>
        </div>
      )}

      {pendingIncoming && (
        <Modal
          title={`${pendingIncoming.name} 请求${pendingLabel}`}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => session.rejectPending()}>
                拒绝
              </button>
              <button type="button" className="btn btn-primary" onClick={() => session.acceptPending()}>
                同意
              </button>
            </>
          }
        >
          <p>
            {pendingIncoming.kind === 'undo'
              ? '同意后，对方将撤回自己刚走的一步。'
              : pendingIncoming.kind === 'draw'
                ? '同意后本局判和。'
                : '同意后双方立即开始新的一局。'}
          </p>
        </Modal>
      )}

      {confirmResign && (
        <Modal
          title="确认认输？"
          tone="danger"
          onBackdrop={() => setConfirmResign(false)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmResign(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmResign(false)
                  session.resign()
                }}
              >
                确认认输
              </button>
            </>
          }
        >
          <p>认输后本局立即结束，无法撤销。</p>
        </Modal>
      )}

      {game.status !== 'playing' && !pendingIncoming && !resultDismissed && (
        <Modal
          title={result.title}
          actions={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setResultDismissed(true)}
              >
                查看棋盘
              </button>
              <button type="button" className="btn btn-ghost" onClick={onLeave}>
                返回大厅
              </button>
              <button type="button" className="btn btn-primary" onClick={() => session.requestRematch()}>
                再来一局
              </button>
            </>
          }
        >
          <p>{result.detail}</p>
        </Modal>
      )}

      {chatOpen && (
        <div className="chat-sheet-backdrop" onClick={() => setChatOpen(false)}>
          <div className="chat-sheet" onClick={(event) => event.stopPropagation()}>
            <ChatPanel
              messages={state.chat}
              onSend={(text) => session.sendChat(text)}
              disabled={state.conn !== 'connected'}
              onClose={() => setChatOpen(false)}
              selfId={state.clientId}
            />
          </div>
        </div>
      )}
    </div>
  )
}
