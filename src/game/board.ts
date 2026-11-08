import { OPPOSITE, PALACE_MAX_COL, PALACE_MIN_COL } from './constants'
import type { Board, Color, Piece, Position, Square } from './types'
import { BOARD_COLS, BOARD_ROWS, BOARD_SIZE } from './types'

export function rowOf(square: Square): number {
  return Math.floor(square / BOARD_COLS)
}

export function colOf(square: Square): number {
  return square % BOARD_COLS
}

export function squareOf(row: number, col: number): Square {
  return row * BOARD_COLS + col
}

export function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS
}

export function opposite(color: Color): Color {
  return OPPOSITE[color]
}

/** 是否在己方九宫内。红方 rows 7-9，黑方 rows 0-2，cols 3-5。 */
export function inPalace(color: Color, row: number, col: number): boolean {
  if (col < PALACE_MIN_COL || col > PALACE_MAX_COL) return false
  return color === 'red' ? row >= 7 && row <= 9 : row >= 0 && row <= 2
}

/** 是否已过河。红方 row <= 4，黑方 row >= 5。 */
export function crossedRiver(color: Color, row: number): boolean {
  return color === 'red' ? row <= 4 : row >= 5
}

/** 是否仍在己方半场（相/象不能过河）。 */
export function onOwnSide(color: Color, row: number): boolean {
  return color === 'red' ? row >= 5 : row <= 4
}

export function emptyBoard(): (Piece | null)[] {
  return new Array<Piece | null>(BOARD_SIZE).fill(null)
}

export function cloneBoard(board: Board): (Piece | null)[] {
  return board.slice()
}

export function pieceAt(board: Board, row: number, col: number): Piece | null {
  if (!inBoard(row, col)) return null
  return board[squareOf(row, col)] ?? null
}

export function findKing(board: Board, color: Color): Square {
  for (let sq = 0; sq < BOARD_SIZE; sq++) {
    const piece = board[sq]
    if (piece && piece.color === color && piece.type === 'K') return sq
  }
  return -1
}

export function hasKing(board: Board, color: Color): boolean {
  return findKing(board, color) >= 0
}

const FEN_PIECE_MAP: Record<string, Piece> = {
  k: { color: 'black', type: 'K' },
  a: { color: 'black', type: 'A' },
  b: { color: 'black', type: 'B' },
  n: { color: 'black', type: 'N' },
  r: { color: 'black', type: 'R' },
  c: { color: 'black', type: 'C' },
  p: { color: 'black', type: 'P' },
  K: { color: 'red', type: 'K' },
  A: { color: 'red', type: 'A' },
  B: { color: 'red', type: 'B' },
  N: { color: 'red', type: 'N' },
  R: { color: 'red', type: 'R' },
  C: { color: 'red', type: 'C' },
  P: { color: 'red', type: 'P' },
}

/** 解析中国象棋 FEN（只需前两段：棋盘 + 行棋方）。 */
export function parseFen(fen: string): Position {
  const ranks = fen.trim().split(/\s+/)[0].split('/')
  if (ranks.length !== BOARD_ROWS) {
    throw new Error(`FEN 行数错误：期望 ${BOARD_ROWS} 行，实际 ${ranks.length}`)
  }

  const board = emptyBoard()
  for (let row = 0; row < BOARD_ROWS; row++) {
    let col = 0
    for (const ch of ranks[row]) {
      if (ch >= '1' && ch <= '9') {
        col += Number(ch)
        continue
      }
      const piece = FEN_PIECE_MAP[ch]
      if (!piece) throw new Error(`FEN 中出现无法识别的字符：${ch}`)
      if (col >= BOARD_COLS) throw new Error(`FEN 第 ${row + 1} 行超出 9 列`)
      board[squareOf(row, col)] = piece
      col++
    }
    if (col !== BOARD_COLS) {
      throw new Error(`FEN 第 ${row + 1} 行列数错误：期望 ${BOARD_COLS}，实际 ${col}`)
    }
  }

  const turnField = fen.trim().split(/\s+/)[1]
  const turn: Color = turnField === 'b' ? 'black' : 'red'
  return { board, turn }
}

export function toFen(board: Board, turn: Color): string {
  const ranks: string[] = []
  for (let row = 0; row < BOARD_ROWS; row++) {
    let rank = ''
    let empty = 0
    for (let col = 0; col < BOARD_COLS; col++) {
      const piece = board[squareOf(row, col)]
      if (!piece) {
        empty++
        continue
      }
      if (empty > 0) {
        rank += String(empty)
        empty = 0
      }
      const letter =
        piece.type === 'K'
          ? 'k'
          : piece.type === 'A'
            ? 'a'
            : piece.type === 'B'
              ? 'b'
              : piece.type === 'N'
                ? 'n'
                : piece.type === 'R'
                  ? 'r'
                  : piece.type === 'C'
                    ? 'c'
                    : 'p'
      rank += piece.color === 'red' ? letter.toUpperCase() : letter
    }
    if (empty > 0) rank += String(empty)
    ranks.push(rank)
  }
  return `${ranks.join('/')} ${turn === 'red' ? 'w' : 'b'} - - 0 1`
}
