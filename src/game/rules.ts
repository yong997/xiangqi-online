import { cloneBoard, findKing, opposite, toFen } from './board'
import { isAttacked, pseudoMoves } from './moves'
import type { Board, Color, Move, Square } from './types'
import { BOARD_SIZE } from './types'

/** 假设走法本身符合棋子走子形状，只检查落点占用与走完后是否被将军。 */
function makeLegal(board: Board, turn: Color, from: Square, to: Square): boolean {
  const piece = board[from]
  if (!piece) return false
  const target = board[to]
  if (target && target.color === turn) return false

  const next = cloneBoard(board)
  next[to] = piece
  next[from] = null

  // 自定义局面/异常局面下允许吃将，直接视为合法。
  if (target && target.type === 'K') return true

  const king = findKing(next, turn)
  if (king < 0) return false
  return !isAttacked(next, king, opposite(turn))
}

/** 判断一步棋是否合法（包括棋子归属、走子形状、将帅照面与解将）。 */
export function isLegalMove(board: Board, turn: Color, move: Move): boolean {
  if (move.from === move.to) return false
  const piece = board[move.from]
  if (!piece || piece.color !== turn) return false
  if (!pseudoMoves(board, move.from).includes(move.to)) return false
  return makeLegal(board, turn, move.from, move.to)
}

/** 某一格棋子的全部合法着法。 */
export function legalMoves(board: Board, turn: Color, from: Square): Square[] {
  const piece = board[from]
  if (!piece || piece.color !== turn) return []
  return pseudoMoves(board, from).filter((to) => makeLegal(board, turn, from, to))
}

/** 当前行棋方的全部合法着法。 */
export function allLegalMoves(board: Board, turn: Color): Move[] {
  const out: Move[] = []
  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = board[from]
    if (!piece || piece.color !== turn) continue
    for (const to of pseudoMoves(board, from)) {
      if (makeLegal(board, turn, from, to)) out.push({ from, to })
    }
  }
  return out
}

export function hasLegalMoves(board: Board, turn: Color): boolean {
  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = board[from]
    if (!piece || piece.color !== turn) continue
    for (const to of pseudoMoves(board, from)) {
      if (makeLegal(board, turn, from, to)) return true
    }
  }
  return false
}

/** 某一方是否正被将军（包含将帅照面）。 */
export function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color)
  if (king < 0) return false
  return isAttacked(board, king, opposite(color))
}

/** 局面标识：棋盘 + 行棋方，用于重复局面判定与同步校验。 */
export function positionKey(board: Board, turn: Color): string {
  return toFen(board, turn)
}
