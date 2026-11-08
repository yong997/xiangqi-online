import { cloneBoard, findKing, opposite, parseFen, toFen } from './board'
import { INITIAL_FEN } from './constants'
import {
  allLegalMoves,
  hasLegalMoves,
  isInCheck,
  isLegalMove,
  legalMoves,
  positionKey,
} from './rules'
import type { Board, Color, GameState, GameStatus, Move, Position, Square } from './types'

/** 着法编码：from * 90 + to，便于网络传输与持久化。 */
export function encodeMove(move: Move): number {
  return move.from * 90 + move.to
}

export function decodeMove(code: number): Move {
  return { from: Math.floor(code / 90), to: code % 90 }
}

function statusFor(
  board: Board,
  turn: Color,
  repetitionCount: number,
): GameStatus {
  if (findKing(board, turn) < 0) {
    return turn === 'red' ? 'black_wins' : 'red_wins'
  }
  if (repetitionCount >= 3) return 'draw'
  if (!hasLegalMoves(board, turn)) {
    return turn === 'red' ? 'black_wins' : 'red_wins'
  }
  return 'playing'
}

export function createGame(fen: string = INITIAL_FEN): GameState {
  const position = parseFen(fen)
  const key = positionKey(position.board, position.turn)
  const repetition: Record<string, number> = { [key]: 1 }
  return {
    board: position.board,
    turn: position.turn,
    moves: [],
    status: statusFor(position.board, position.turn, 1),
    repetition,
  }
}

/** 从着法列表确定性重放，用于同步与刷新恢复。 */
export function replayGame(codes: ReadonlyArray<number>, fen: string = INITIAL_FEN): GameState {
  let state = createGame(fen)
  for (const code of codes) {
    state = applyMove(state, decodeMove(code))
  }
  return state
}

export function applyMove(state: GameState, move: Move): GameState {
  if (state.status !== 'playing') throw new Error('对局已结束')
  if (!isLegalMove(state.board, state.turn, move)) throw new Error('非法着法')

  const mover = state.turn
  const board = cloneBoard(state.board)
  const captured = board[move.to]
  board[move.to] = board[move.from]
  board[move.from] = null

  const turn = opposite(mover)
  const key = positionKey(board, turn)
  const repetition: Record<string, number> = {
    ...state.repetition,
    [key]: (state.repetition[key] ?? 0) + 1,
  }

  let status: GameStatus
  if (captured?.type === 'K' || findKing(board, turn) < 0) {
    status = mover === 'red' ? 'red_wins' : 'black_wins'
  } else {
    status = statusFor(board, turn, repetition[key])
  }

  return {
    board,
    turn,
    moves: [...state.moves, move],
    status,
    repetition,
  }
}

/** UI：某一格棋子的合法落点。 */
export function legalMovesFor(state: GameState, from: Square): Square[] {
  return legalMoves(state.board, state.turn, from)
}

export function allMovesFor(state: GameState): Move[] {
  return allLegalMoves(state.board, state.turn)
}

export function isInCheckFor(state: GameState, color: Color): boolean {
  return isInCheck(state.board, color)
}

export function toFenOf(state: GameState): string {
  return toFen(state.board, state.turn)
}

export function moveNo(state: GameState): number {
  return state.moves.length
}

/**
 * perft：统计指定深度下的合法着法序列数量，用于校验规则实现。
 * 使用轻量的 makePosition，不计算终局状态，避免测试时重复扫描。
 */
export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = allLegalMoves(position.board, position.turn)
  if (depth === 1) return moves.length

  let total = 0
  for (const move of moves) {
    const next = makePosition(position, move)
    total += perft(next, depth - 1)
  }
  return total
}

/** 只落子、换手，不判定终局。 */
function makePosition(position: Position, move: Move): Position {
  const board = cloneBoard(position.board)
  board[move.to] = board[move.from]
  board[move.from] = null
  return { board, turn: opposite(position.turn) }
}
