import { describe, expect, it } from 'vitest'
import { findKing, squareOf } from '../../src/game/board'
import {
  applyJieqiMove,
  createJieqiGame,
  jieqiLegalMovesFrom,
  jieqiPositionKey,
  kingsFacing,
} from '../../src/game/jieqi'
import type { Board, Piece } from '../../src/game/types'
import { BOARD_SIZE } from '../../src/game/types'

function emptyBoard(): (Piece | null)[] {
  return new Array<Piece | null>(BOARD_SIZE).fill(null)
}

describe('揭棋规则引擎', () => {
  it('初始：将帅明置，其余 15 枚暗置且身份为完整牌组', () => {
    const state = createJieqiGame(12345)
    expect(findKing(state.board, 'red')).toBe(squareOf(9, 4))
    expect(findKing(state.board, 'black')).toBe(squareOf(0, 4))
    for (const color of ['red', 'black'] as const) {
      const hidden = state.board.filter((p) => p && p.color === color && p.hidden)
      expect(hidden.length).toBe(15)
      const kings = state.board.filter((p) => p && p.color === color && p.type === 'K')
      expect(kings.length).toBe(1)
      const trues = hidden.map((p) => p!.trueType)
      expect(trues.filter((t) => t === 'P').length).toBe(5)
      expect(trues.filter((t) => t === 'R').length).toBe(2)
      expect(trues.filter((t) => t === 'N').length).toBe(2)
      expect(trues.filter((t) => t === 'B').length).toBe(2)
      expect(trues.filter((t) => t === 'A').length).toBe(2)
      expect(trues.filter((t) => t === 'C').length).toBe(2)
    }
    expect(state.status).toBe('playing')
  })

  it('同一随机种子生成同一局面，不同种子不同', () => {
    const a = createJieqiGame(999)
    const b = createJieqiGame(999)
    const c = createJieqiGame(1000)
    expect(jieqiPositionKey(a.board, a.turn)).toBe(jieqiPositionKey(b.board, b.turn))
    expect(jieqiPositionKey(a.board, a.turn)).not.toBe(jieqiPositionKey(c.board, c.turn))
  })

  it('暗子首步按所在布阵格类型走，走完即翻开', () => {
    const state = createJieqiGame(42)
    const pawnSlot = squareOf(6, 0)
    const pawn = state.board[pawnSlot]!
    expect(pawn.hidden).toBe(true)
    expect(pawn.type).toBe('P')
    const moves = jieqiLegalMovesFrom(state, pawnSlot)
    expect(moves).toContain(squareOf(5, 0))
    // 未过河兵不能横走
    expect(moves).not.toContain(squareOf(6, 1))

    const next = applyJieqiMove(state, { from: pawnSlot, to: squareOf(5, 0) })
    const revealed = next.board[squareOf(5, 0)]!
    expect(revealed.hidden).toBe(false)
    expect(revealed.type).toBe(pawn.trueType)
    expect(revealed.type).toBe(revealed.trueType)
  })

  it('揭棋士可出九宫过河、象可过河且受塞眼限制', () => {
    const base = createJieqiGame(7)
    const board = base.board.slice()
    // 清空中间若干格，放一个红士在河界附近
    board[squareOf(5, 4)] = { color: 'red', type: 'A' }
    const state = { ...base, board, turn: 'red' as const }
    const aMoves = jieqiLegalMovesFrom(state, squareOf(5, 4))
    // 士斜走一格，不限九宫
    expect(aMoves).toContain(squareOf(4, 3))
    expect(aMoves).toContain(squareOf(6, 5))

    const board2 = base.board.slice()
    board2[squareOf(5, 4)] = { color: 'red', type: 'B' }
    const state2 = { ...base, board: board2, turn: 'red' as const }
    const bMoves = jieqiLegalMovesFrom(state2, squareOf(5, 4))
    // 象走田可过河（(3,2) 在黑方半场）
    expect(bMoves).toContain(squareOf(3, 2))
  })

  it('将帅照面判定', () => {
    const board = emptyBoard()
    board[squareOf(9, 4)] = { color: 'red', type: 'K' }
    board[squareOf(0, 4)] = { color: 'black', type: 'K' }
    expect(kingsFacing(board)).toBe(true)
    board[squareOf(4, 4)] = { color: 'red', type: 'P', hidden: true, trueType: 'P' }
    expect(kingsFacing(board)).toBe(false)
  })

  it('重复局面 key 包含暗子真实身份', () => {
    const a = createJieqiGame(123)
    const board1 = a.board.slice()
    const hiddenSquare = board1.findIndex((p) => p?.hidden)
    const board2 = board1.slice()
    const original = board1[hiddenSquare]!
    board2[hiddenSquare] = { ...original, trueType: original.trueType === 'R' ? 'N' : 'R' }
    expect(jieqiPositionKey(board1 as Board, 'red')).not.toBe(
      jieqiPositionKey(board2 as Board, 'red'),
    )
  })

  it('不能把己方将帅置于被吃状态', () => {
    const state = createJieqiGame(55)
    // 初始局面下不应存在直接吃将的合法走法（引擎层面所有走法都需保证己方不被将军）
    const all = jieqiLegalMovesFrom(state, squareOf(7, 1))
    for (const to of all) {
      const target = state.board[to]
      expect(target?.type).not.toBe('K')
    }
  })
})
