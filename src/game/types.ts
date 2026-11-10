/** 棋盘 10 行 × 9 列，row 0 为黑方底线（上），row 9 为红方底线（下）。 */
export const BOARD_ROWS = 10
export const BOARD_COLS = 9
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS

export type Color = 'red' | 'black'

export type GameVariant = 'standard' | 'jieqi'

/**
 * 棋子类型（与中国象棋 FEN 通用字母一致）：
 * K 帅/将，A 仕/士，B 相/象，N 马，R 车，C 炮，P 兵/卒。
 */
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P'

export interface Piece {
  color: Color
  type: PieceType
  /** 揭棋：是否为未翻开的暗子（此时 type 为所在布阵格的棋子类型） */
  hidden?: boolean
  /** 揭棋：暗子的真实身份；翻开后与 type 相同 */
  trueType?: PieceType
}

export type Board = ReadonlyArray<Piece | null>

/** 格子索引：row * 9 + col，范围 0..89。 */
export type Square = number

export interface Move {
  from: Square
  to: Square
}

export type GameStatus = 'playing' | 'red_wins' | 'black_wins' | 'draw'

export interface GameState {
  board: Board
  turn: Color
  moves: ReadonlyArray<Move>
  status: GameStatus
  /** 局面重复计数，key 为 positionKey（棋盘 + 行棋方），用于三次重复判和。 */
  repetition: Readonly<Record<string, number>>
  /** 揭棋：距上次吃子的步数（用于 120 步无吃子判和）。 */
  noCapturePlies?: number
}

export interface Position {
  board: Board
  turn: Color
}
