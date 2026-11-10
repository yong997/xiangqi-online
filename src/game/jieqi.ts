import {
  colOf,
  findKing,
  inBoard,
  opposite,
  rowOf,
  squareOf,
} from './board'
import { PIECE_NAMES } from './constants'
import { pseudoMoves } from './moves'
import { moveToChinese } from './notation'
import type { Board, Color, GameState, GameStatus, Move, Piece, PieceType, Square } from './types'
import { BOARD_COLS, BOARD_SIZE } from './types'

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

const BACK_ROW: ReadonlyArray<PieceType> = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
const CANNON_COLS = [1, 7]
const PAWN_COLS = [0, 2, 4, 6, 8]
const DECK: ReadonlyArray<PieceType> = ['R', 'R', 'N', 'N', 'B', 'B', 'A', 'A', 'C', 'C', 'P', 'P', 'P', 'P', 'P']
const DRAW_NO_CAPTURE_PLIES = 120

/** 32 枚棋子中，除将/帅外的 15 个初始布阵格及其“位置棋子类型”。 */
export interface JieqiSlot {
  square: Square
  slotType: PieceType
}

export function jieqiSlots(color: Color): JieqiSlot[] {
  const backRow = color === 'red' ? 9 : 0
  const cannonRow = color === 'red' ? 7 : 2
  const pawnRow = color === 'red' ? 6 : 3
  const slots: JieqiSlot[] = []
  for (let col = 0; col < BOARD_COLS; col++) {
    if (col === 4) continue // 将/帅原位明置
    slots.push({ square: squareOf(backRow, col), slotType: BACK_ROW[col] })
  }
  for (const col of CANNON_COLS) slots.push({ square: squareOf(cannonRow, col), slotType: 'C' })
  for (const col of PAWN_COLS) slots.push({ square: squareOf(pawnRow, col), slotType: 'P' })
  return slots.sort((a, b) => a.square - b.square)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledDeck(rng: () => number): PieceType[] {
  const deck = [...DECK]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
  return deck
}

function emptyBoard(): (Piece | null)[] {
  return new Array<Piece | null>(BOARD_SIZE).fill(null)
}

/** 生成一局揭棋初始局面：将/帅明置，其余 15 枚按种子随机暗置在本方布阵格。 */
export function createJieqiGame(seed: number): GameState {
  const rng = mulberry32(seed)
  const board = emptyBoard()
  board[squareOf(0, 4)] = { color: 'black', type: 'K' }
  board[squareOf(9, 4)] = { color: 'red', type: 'K' }

  for (const color of ['red', 'black'] as const) {
    const deck = shuffledDeck(rng)
    const slots = jieqiSlots(color)
    slots.forEach((slot, index) => {
      const trueType = deck[index]
      board[slot.square] = { color, type: slot.slotType, hidden: true, trueType }
    })
  }

  const turn: Color = 'red'
  const key = jieqiPositionKey(board, turn)
  const repetition: Record<string, number> = { [key]: 1 }
  const status = jieqiStatusFor(board, turn, 1, 0)
  return { board, turn, moves: [], status, repetition, noCapturePlies: 0 }
}

function canLand(board: Board, color: Color, row: number, col: number): boolean {
  if (!inBoard(row, col)) return false
  const target = board[squareOf(row, col)]
  return !target || target.color !== color
}

/** 揭棋走法：士斜一步不限九宫可过河；象走田受塞眼、可过河；其余按标准。 */
function pseudoTargets(board: Board, from: Square): Square[] {
  const piece = board[from]
  if (!piece) return []
  const row = rowOf(from)
  const col = colOf(from)
  const color = piece.color

  if (piece.type === 'A') {
    const out: Square[] = []
    for (const [dr, dc] of DIAG) {
      const r = row + dr
      const c = col + dc
      if (inBoard(r, c) && canLand(board, color, r, c)) out.push(squareOf(r, c))
    }
    return out
  }

  if (piece.type === 'B') {
    const out: Square[] = []
    for (const [dr, dc] of DIAG) {
      const r = row + dr * 2
      const c = col + dc * 2
      if (!inBoard(r, c)) continue
      if (board[squareOf(row + dr, col + dc)]) continue // 塞象眼
      if (canLand(board, color, r, c)) out.push(squareOf(r, c))
    }
    return out
  }

  return pseudoMoves(board, from)
}

/** 将帅照面：同列且中间无子。 */
export function kingsFacing(board: Board): boolean {
  const redKing = findKing(board, 'red')
  const blackKing = findKing(board, 'black')
  if (redKing < 0 || blackKing < 0) return false
  if (colOf(redKing) !== colOf(blackKing)) return false
  const col = colOf(redKing)
  const from = Math.min(rowOf(redKing), rowOf(blackKing))
  const to = Math.max(rowOf(redKing), rowOf(blackKing))
  for (let row = from + 1; row < to; row++) {
    if (board[squareOf(row, col)]) return false
  }
  return true
}

/** 某格是否被 byColor 一方攻击（暗子按其位置类型计算；士/象按揭棋走法）。 */
export function jieqiIsAttacked(board: Board, square: Square, byColor: Color): boolean {
  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = board[from]
    if (!piece || piece.color !== byColor) continue
    if (pseudoTargets(board, from).includes(square)) return true
  }
  return false
}

export function jieqiIsInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color)
  if (king < 0) return true
  return jieqiIsAttacked(board, king, opposite(color))
}

export interface JieqiSimulation {
  board: (Piece | null)[]
  captured: Piece | null
}

function simulate(board: Board, move: Move): JieqiSimulation {
  const next = board.slice()
  const moving = next[move.from]
  const captured = next[move.to] ?? null
  if (!moving) return { board: next, captured }
  next[move.to] = moving.hidden
    ? {
        color: moving.color,
        type: moving.trueType ?? moving.type,
        hidden: false,
        trueType: moving.trueType ?? moving.type,
      }
    : moving
  next[move.from] = null
  return { board: next, captured }
}

/** 单个棋子的合法落点（已翻开按真实身份，暗子首步按位置类型）。 */
export function jieqiLegalMovesFrom(state: GameState, from: Square): Square[] {
  const piece = state.board[from]
  if (!piece || piece.color !== state.turn) return []
  const opponent = opposite(piece.color)
  const out: Square[] = []
  for (const to of pseudoTargets(state.board, from)) {
    const target = state.board[to]
    if (target && target.type === 'K') continue // 将/帅不可被实际吃掉
    const sim = simulate(state.board, { from, to })
    const king = findKing(sim.board, piece.color)
    if (king < 0) continue
    if (kingsFacing(sim.board)) continue
    if (jieqiIsAttacked(sim.board, king, opponent)) continue
    out.push(to)
  }
  return out
}

export function jieqiAllLegalMoves(state: GameState): Move[] {
  const out: Move[] = []
  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = state.board[from]
    if (!piece || piece.color !== state.turn) continue
    for (const to of jieqiLegalMovesFrom(state, from)) out.push({ from, to })
  }
  return out
}

export function jieqiHasLegalMoves(state: GameState): boolean {
  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = state.board[from]
    if (!piece || piece.color !== state.turn) continue
    if (jieqiLegalMovesFrom(state, from).length > 0) return true
  }
  return false
}

function jieqiStatusFor(
  board: Board,
  turn: Color,
  repetitionCount: number,
  noCapturePlies: number,
): GameStatus {
  if (findKing(board, turn) < 0) return turn === 'red' ? 'black_wins' : 'red_wins'
  if (repetitionCount >= 3) return 'draw'
  if (noCapturePlies >= DRAW_NO_CAPTURE_PLIES) return 'draw'
  const probe: GameState = {
    board,
    turn,
    moves: [],
    status: 'playing',
    repetition: {},
    noCapturePlies,
  }
  if (!jieqiHasLegalMoves(probe)) return turn === 'red' ? 'black_wins' : 'red_wins'
  return 'playing'
}

/** 重复局面 key：包含行棋方、暗子真实身份与明暗状态。 */
export function jieqiPositionKey(board: Board, turn: Color): string {
  const parts: string[] = [turn === 'red' ? 'r' : 'b']
  for (let sq = 0; sq < BOARD_SIZE; sq++) {
    const piece = board[sq]
    if (!piece) continue
    const colorTag = piece.color === 'red' ? 'R' : 'B'
    if (piece.hidden) {
      parts.push(`${sq}:${colorTag}?${piece.type}:${piece.trueType ?? '?'}`)
    } else {
      parts.push(`${sq}:${colorTag}${piece.type}`)
    }
  }
  return parts.join('|')
}

export function applyJieqiMove(state: GameState, move: Move): GameState {
  if (state.status !== 'playing') throw new Error('对局已结束')
  const legal = jieqiLegalMovesFrom(state, move.from)
  if (!legal.includes(move.to)) throw new Error('非法着法')
  const sim = simulate(state.board, move)
  const turn = opposite(state.turn)
  const noCapturePlies = sim.captured ? 0 : (state.noCapturePlies ?? 0) + 1
  const key = jieqiPositionKey(sim.board, turn)
  const repetitionCount = (state.repetition[key] ?? 0) + 1
  const repetition: Record<string, number> = { ...state.repetition, [key]: repetitionCount }
  const status = jieqiStatusFor(sim.board, turn, repetitionCount, noCapturePlies)
  return {
    board: sim.board,
    turn,
    moves: [...state.moves, move],
    status,
    repetition,
    noCapturePlies,
  }
}

/** 从着法列表确定性地重放一局揭棋（需要同一随机种子）。 */
export function replayJieqi(seed: number, codes: ReadonlyArray<number>): GameState {
  let state = createJieqiGame(seed)
  for (const code of codes) {
    state = applyJieqiMove(state, { from: Math.floor(code / 90), to: code % 90 })
  }
  return state
}

/** 揭棋记谱：按位置类型记谱，并在暗子翻开/吃暗子时附注真实身份。 */
export function jieqiMoveToChinese(board: Board, move: Move): string {
  const piece = board[move.from]
  const base = moveToChinese(board, move)
  if (!piece) return base
  let suffix = ''
  if (piece.hidden) {
    const trueType = piece.trueType ?? piece.type
    suffix += `（翻${PIECE_NAMES[piece.color][trueType]}）`
  }
  const target = board[move.to]
  if (target && target.hidden) {
    const trueType = target.trueType ?? target.type
    suffix += `（吃${PIECE_NAMES[target.color][trueType]}）`
  }
  return base + suffix
}
