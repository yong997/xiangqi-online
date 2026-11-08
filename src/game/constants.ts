import type { Color, PieceType } from './types'

/** 标准中国象棋初始局面，红方先行。 */
export const INITIAL_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'

export const PIECE_TYPES: ReadonlyArray<PieceType> = ['K', 'A', 'B', 'N', 'R', 'C', 'P']

/** 棋子中文名（红方 / 黑方）。 */
export const PIECE_NAMES: Record<Color, Record<PieceType, string>> = {
  red: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' },
}

/** 各棋子的初始摆放（用于 UI 图例等）。 */
export const PIECE_ORDER: ReadonlyArray<PieceType> = ['K', 'A', 'B', 'N', 'R', 'C', 'P']

export const OPPOSITE: Record<Color, Color> = { red: 'black', black: 'red' }

/** 九宫列范围（红黑相同）。 */
export const PALACE_MIN_COL = 3
export const PALACE_MAX_COL = 5
