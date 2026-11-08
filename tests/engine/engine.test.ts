import { describe, expect, it } from 'vitest'
import { parseFen, squareOf, toFen } from '../../src/game/board'
import { INITIAL_FEN } from '../../src/game/constants'
import {
  applyMove,
  createGame,
  decodeMove,
  encodeMove,
  perft,
  replayGame,
  toFenOf,
} from '../../src/game/engine'
import { isAttacked, pseudoMoves } from '../../src/game/moves'
import { allLegalMoves, hasLegalMoves, isInCheck, legalMoves } from '../../src/game/rules'

const sq = squareOf

function position(fen: string) {
  return parseFen(fen)
}

describe('FEN 与初始局面', () => {
  it('FEN 解析/序列化往返一致', () => {
    const pos = position(INITIAL_FEN)
    expect(toFen(pos.board, pos.turn)).toBe(INITIAL_FEN)
  })

  it('初始局面红方有 44 个合法着法，且黑方未走棋', () => {
    const game = createGame()
    expect(game.turn).toBe('red')
    expect(game.status).toBe('playing')
    expect(allLegalMoves(game.board, game.turn)).toHaveLength(44)
    expect(hasLegalMoves(game.board, 'black')).toBe(true)
  })

  it('perft 深度 1-3 与公开基准一致', () => {
    const pos = position(INITIAL_FEN)
    expect(perft(pos, 1)).toBe(44)
    expect(perft(pos, 2)).toBe(1920)
    expect(perft(pos, 3)).toBe(79666)
  }, 60_000)
})

describe('马腿', () => {
  it('马腿被占时对应方向不能走', () => {
    // 黑马在 (4,4)，正上方 (3,4) 有子，挡住 -2 方向的两个着法。
    const pos = position('9/9/9/4P4/4n4/9/9/9/9/9 w')
    const moves = pseudoMoves(pos.board, sq(4, 4))
    expect(moves).toHaveLength(6)
    expect(moves).not.toContain(sq(2, 3))
    expect(moves).not.toContain(sq(2, 5))
  })

  it('马腿为空时可以走满 8 个方向', () => {
    const pos = position('9/9/9/9/4n4/9/9/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(4, 4))).toHaveLength(8)
  })
})

describe('象眼与过河限制', () => {
  it('象眼被占时不能走', () => {
    // 红相在 (9,2)，象眼 (8,3) 有子，只剩 (7,0)。
    const pos = position('9/9/9/9/9/9/9/9/3P5/2B6 w')
    const moves = pseudoMoves(pos.board, sq(9, 2))
    expect(moves).toEqual([sq(7, 0)])
  })

  it('相/象不能过河', () => {
    // 红相在 (5,2)，只能走到 (7,0) 或 (7,4)，不能到 (3,0)/(3,4)。
    const pos = position('9/9/9/9/9/2B6/9/9/9/9 w')
    const moves = pseudoMoves(pos.board, sq(5, 2))
    expect(new Set(moves)).toEqual(new Set([sq(7, 0), sq(7, 4)]))
  })
})

describe('炮', () => {
  it('隔一个炮架可以吃子', () => {
    // 红炮 (5,4)，红兵 (4,4) 作炮架，黑卒 (3,4) 可吃。
    const pos = position('9/9/9/4p4/4P4/4C4/9/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(5, 4))).toContain(sq(3, 4))
  })

  it('没有炮架不能吃子', () => {
    const pos = position('9/9/9/4p4/9/4C4/9/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(5, 4))).not.toContain(sq(3, 4))
  })

  it('隔两个子不能吃子', () => {
    const pos = position('9/9/4p4/4P4/4P4/4C4/9/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(5, 4))).not.toContain(sq(2, 4))
  })

  it('不吃子时不能越过炮架', () => {
    const pos = position('9/9/9/9/4P4/4C4/9/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(5, 4))).not.toContain(sq(3, 4))
  })
})

describe('兵/卒', () => {
  it('未过河只能向前一步', () => {
    const pos = position('9/9/9/9/9/9/P8/9/9/9 w')
    expect(pseudoMoves(pos.board, sq(6, 0))).toEqual([sq(5, 0)])
  })

  it('过河后可以向前和左右移动，不能后退', () => {
    const pos = position('9/9/9/9/P8/9/9/9/9/9 w')
    const moves = pseudoMoves(pos.board, sq(4, 0))
    expect(new Set(moves)).toEqual(new Set([sq(3, 0), sq(4, 1)]))
    expect(moves).not.toContain(sq(5, 0))
  })

  it('黑卒过河方向相反', () => {
    const pos = position('9/9/9/9/9/p8/9/9/9/9 w')
    const moves = pseudoMoves(pos.board, sq(5, 0))
    expect(new Set(moves)).toEqual(new Set([sq(6, 0), sq(5, 1)]))
  })
})

describe('九宫限制', () => {
  it('帅只能在九宫内移动', () => {
    const pos = position('9/9/9/9/9/9/9/9/9/4K4 w')
    const moves = pseudoMoves(pos.board, sq(9, 4))
    expect(new Set(moves)).toEqual(new Set([sq(8, 4), sq(9, 3), sq(9, 5)]))
  })

  it('仕只能斜走一步且不出九宫', () => {
    const pos = position('9/9/9/9/9/9/9/9/9/3A5 w')
    expect(pseudoMoves(pos.board, sq(9, 3))).toEqual([sq(8, 4)])
  })
})

describe('将帅照面', () => {
  it('移开挡子导致将帅照面是非法着法', () => {
    // 黑将 (0,4)，红帅 (9,4)，黑车 (5,4) 是唯一挡子。
    // 黑车离开第 4 列会照面，因此只能沿第 4 列移动。
    const pos = position('4k4/9/9/9/9/4r4/9/9/9/4K4 b')
    const moves = legalMoves(pos.board, 'black', sq(5, 4))
    expect(moves.length).toBeGreaterThan(0)
    for (const to of moves) {
      expect(to % 9).toBe(4)
    }
    expect(moves).not.toContain(sq(5, 3))
    expect(moves).not.toContain(sq(5, 5))
  })

  it('照面状态被识别为被将军', () => {
    const pos = position('4k4/9/9/9/9/9/9/9/9/4K4 w')
    expect(isInCheck(pos.board, 'red')).toBe(true)
    expect(isInCheck(pos.board, 'black')).toBe(true)
    expect(isAttacked(pos.board, sq(9, 4), 'black')).toBe(true)
  })
})

describe('将军、应将与终局', () => {
  it('被将军时只能走解将着法', () => {
    // 黑车 (1,4) 直照红帅 (9,4)，黑将 (0,4) 被黑车挡住不会照面；
    // 红车 (8,0) 只能走到 (8,4) 挡将。
    const pos = position('4k4/4r4/9/9/9/9/9/9/R8/4K4 w')
    expect(isInCheck(pos.board, 'red')).toBe(true)
    expect(legalMoves(pos.board, 'red', sq(8, 0))).toEqual([sq(8, 4)])

    const kingMoves = legalMoves(pos.board, 'red', sq(9, 4))
    expect(new Set(kingMoves)).toEqual(new Set([sq(9, 3), sq(9, 5)]))

    for (const move of allLegalMoves(pos.board, 'red')) {
      const next = { ...pos, board: pos.board.slice() }
      next.board[move.to] = next.board[move.from]
      next.board[move.from] = null
      expect(isInCheck(next.board, 'red')).toBe(false)
    }
  })

  it('将死判负', () => {
    // 黑将 (0,4)，红车 (1,4) 将军，红车 (0,0) 控制 (0,3)/(0,5)，红兵 (2,4) 守住 (1,4)。
    const fen = 'R3k4/4R4/4P4/9/9/9/9/9/9/4K4 b'
    const pos = position(fen)
    expect(isInCheck(pos.board, 'black')).toBe(true)
    expect(hasLegalMoves(pos.board, 'black')).toBe(false)
    expect(createGame(fen).status).toBe('red_wins')
  })

  it('困毙同样判负', () => {
    // 黑将 (0,4) 未被将军，但 (0,3)/(0,5) 被红马控制，(1,4) 被红车控制。
    const fen = '4k4/R8/4N4/9/9/9/9/9/9/4K4 b'
    const pos = position(fen)
    expect(isInCheck(pos.board, 'black')).toBe(false)
    expect(hasLegalMoves(pos.board, 'black')).toBe(false)
    expect(createGame(fen).status).toBe('red_wins')
  })

  it('三次重复局面判和', () => {
    const game = createGame('r2k5/9/9/9/9/9/9/9/9/R3K4 w')
    const shuffle = [
      { from: sq(9, 0), to: sq(8, 0) },
      { from: sq(0, 0), to: sq(1, 0) },
      { from: sq(8, 0), to: sq(9, 0) },
      { from: sq(1, 0), to: sq(0, 0) },
    ]
    let state = game
    for (let round = 0; round < 2; round++) {
      for (const move of shuffle) state = applyMove(state, move)
    }
    expect(state.status).toBe('draw')
    expect(state.moves).toHaveLength(8)
  }, 20_000)
})

describe('着法编码与重放', () => {
  it('编码/解码往返一致', () => {
    const move = { from: sq(9, 1), to: sq(7, 2) }
    expect(decodeMove(encodeMove(move))).toEqual(move)
  })

  it('同一着法列表确定性重放得到同一局面', () => {
    let state = createGame()
    const first = allLegalMoves(state.board, state.turn)[0]
    state = applyMove(state, first)
    const second = allLegalMoves(state.board, state.turn)[0]
    state = applyMove(state, second)

    const replayed = replayGame(state.moves.map(encodeMove))
    expect(toFenOf(replayed)).toBe(toFenOf(state))
    expect(replayed.status).toBe(state.status)
  })

  it('非法着法会被拒绝', () => {
    const game = createGame()
    expect(() => applyMove(game, { from: sq(9, 0), to: sq(9, 1) })).toThrow('非法着法')
  })
})
