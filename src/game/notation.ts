import { colOf, rowOf } from './board'
import { PIECE_NAMES } from './constants'
import type { Board, Color, Move } from './types'
import { BOARD_ROWS } from './types'

const RED_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const BLACK_NUMERALS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** 红方从右往左数 1-9，黑方从自己的右侧（红方左侧）数 1-9。 */
function fileLabel(color: Color, col: number): string {
  return color === 'red'
    ? RED_NUMERALS[8 - col]
    : BLACK_NUMERALS[col]
}

function countLabel(color: Color, count: number): string {
  return color === 'red' ? RED_NUMERALS[count - 1] : BLACK_NUMERALS[count - 1]
}

/**
 * 生成一步棋的中文记谱，例如「炮二平五」「马8进7」。
 * 只处理常见的同列同种棋子 前/中/后 消歧，复杂兵形不做完全展开。
 */
export function moveToChinese(board: Board, move: Move): string {
  const piece = board[move.from]
  if (!piece) return ''

  const color = piece.color
  const name = PIECE_NAMES[color][piece.type]
  const fromRow = rowOf(move.from)
  const fromCol = colOf(move.from)
  const toRow = rowOf(move.to)
  const toCol = colOf(move.to)

  const sameFile: number[] = []
  for (let row = 0; row < BOARD_ROWS; row++) {
    const other = board[row * 9 + fromCol]
    if (other && other.color === color && other.type === piece.type) {
      sameFile.push(row)
    }
  }

  let prefix = ''
  if (sameFile.length >= 2) {
    sameFile.sort((a, b) => (color === 'red' ? a - b : b - a))
    const index = sameFile.indexOf(fromRow)
    if (sameFile.length === 2) prefix = index === 0 ? '前' : '后'
    else prefix = index === 0 ? '前' : index === sameFile.length - 1 ? '后' : '中'
  }

  const pieceText = prefix ? `${prefix}${name}` : `${name}${fileLabel(color, fromCol)}`
  const horizontal = fromRow === toRow
  const forward = color === 'red' ? toRow < fromRow : toRow > fromRow

  if (horizontal) {
    return `${pieceText}平${fileLabel(color, toCol)}`
  }

  const action = forward ? '进' : '退'
  const diagonalMover =
    piece.type === 'N' || piece.type === 'B' || piece.type === 'A'
  const target = diagonalMover
    ? fileLabel(color, toCol)
    : countLabel(color, Math.abs(toRow - fromRow))

  return `${pieceText}${action}${target}`
}
