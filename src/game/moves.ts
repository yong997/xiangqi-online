import {
  colOf,
  crossedRiver,
  findKing,
  inBoard,
  inPalace,
  onOwnSide,
  rowOf,
  squareOf,
} from './board'
import type { Board, Color, Square } from './types'

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** 马：目标偏移 + 对应马腿偏移。 */
const HORSE: ReadonlyArray<readonly [number, number, number, number]> = [
  [-2, -1, -1, 0],
  [-2, 1, -1, 0],
  [2, -1, 1, 0],
  [2, 1, 1, 0],
  [-1, -2, 0, -1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [1, 2, 0, 1],
]

function canLand(board: Board, color: Color, row: number, col: number): boolean {
  if (!inBoard(row, col)) return false
  const target = board[squareOf(row, col)]
  return !target || target.color !== color
}

/** 生成某一格棋子的伪合法着法（不检查己方是否被将军/将帅照面）。 */
export function pseudoMoves(board: Board, from: Square): Square[] {
  const piece = board[from]
  if (!piece) return []

  const row = rowOf(from)
  const col = colOf(from)
  const color = piece.color
  const out: Square[] = []

  switch (piece.type) {
    case 'K': {
      for (const [dr, dc] of ORTHO) {
        const r = row + dr
        const c = col + dc
        if (inPalace(color, r, c) && canLand(board, color, r, c)) {
          out.push(squareOf(r, c))
        }
      }
      break
    }

    case 'A': {
      for (const [dr, dc] of DIAG) {
        const r = row + dr
        const c = col + dc
        if (inPalace(color, r, c) && canLand(board, color, r, c)) {
          out.push(squareOf(r, c))
        }
      }
      break
    }

    case 'B': {
      for (const [dr, dc] of DIAG) {
        const r = row + dr * 2
        const c = col + dc * 2
        if (!inBoard(r, c) || !onOwnSide(color, r)) continue
        const eye = board[squareOf(row + dr, col + dc)]
        if (eye) continue
        if (canLand(board, color, r, c)) out.push(squareOf(r, c))
      }
      break
    }

    case 'N': {
      for (const [dr, dc, lr, lc] of HORSE) {
        const legRow = row + lr
        const legCol = col + lc
        if (!inBoard(legRow, legCol) || board[squareOf(legRow, legCol)]) continue
        const r = row + dr
        const c = col + dc
        if (inBoard(r, c) && canLand(board, color, r, c)) out.push(squareOf(r, c))
      }
      break
    }

    case 'R': {
      for (const [dr, dc] of ORTHO) {
        let r = row + dr
        let c = col + dc
        while (inBoard(r, c)) {
          const target = board[squareOf(r, c)]
          if (!target) {
            out.push(squareOf(r, c))
          } else {
            if (target.color !== color) out.push(squareOf(r, c))
            break
          }
          r += dr
          c += dc
        }
      }
      break
    }

    case 'C': {
      for (const [dr, dc] of ORTHO) {
        let r = row + dr
        let c = col + dc
        let screen = false
        while (inBoard(r, c)) {
          const target = board[squareOf(r, c)]
          if (!screen) {
            if (!target) {
              out.push(squareOf(r, c))
            } else {
              screen = true
            }
          } else if (target) {
            if (target.color !== color) out.push(squareOf(r, c))
            break
          }
          r += dr
          c += dc
        }
      }
      break
    }

    case 'P': {
      const forward = color === 'red' ? -1 : 1
      const r = row + forward
      if (canLand(board, color, r, col)) out.push(squareOf(r, col))
      if (crossedRiver(color, row)) {
        for (const dc of [-1, 1]) {
          if (canLand(board, color, row, col + dc)) out.push(squareOf(row, col + dc))
        }
      }
      break
    }
  }

  return out
}

/**
 * 判断 square 是否被 byColor 一方攻击。
 * 包含「将帅照面」：同一列且中间无子时，对方将/帅视为攻击。
 * 只做攻击判定，不要求目标格为空。
 */
export function isAttacked(board: Board, square: Square, byColor: Color): boolean {
  const tr = rowOf(square)
  const tc = colOf(square)

  // 兵/卒：正面一步；过河后左右各一步。
  const forward = byColor === 'red' ? -1 : 1
  const pawnRow = tr - forward
  if (inBoard(pawnRow, tc)) {
    const p = board[squareOf(pawnRow, tc)]
    if (p && p.color === byColor && p.type === 'P') return true
  }
  if (crossedRiver(byColor, tr)) {
    for (const dc of [-1, 1]) {
      const c = tc + dc
      if (!inBoard(tr, c)) continue
      const p = board[squareOf(tr, c)]
      if (p && p.color === byColor && p.type === 'P') return true
    }
  }

  // 将/帅：相邻一步，或同列无遮挡（将帅照面）。
  const enemyKing = findKing(board, byColor)
  if (enemyKing >= 0) {
    const kr = rowOf(enemyKing)
    const kc = colOf(enemyKing)
    if (Math.abs(kr - tr) + Math.abs(kc - tc) === 1) return true
    if (kc === tc) {
      const step = tr > kr ? 1 : -1
      let blocked = false
      for (let r = kr + step; r !== tr; r += step) {
        if (board[squareOf(r, tc)]) {
          blocked = true
          break
        }
      }
      if (!blocked) return true
    }
  }

  // 仕/士：斜向相邻。
  for (const [dr, dc] of DIAG) {
    const r = tr + dr
    const c = tc + dc
    if (!inBoard(r, c)) continue
    const p = board[squareOf(r, c)]
    if (p && p.color === byColor && p.type === 'A') return true
  }

  // 相/象：斜向两格，象眼为空，且目标在对方半场。
  if (onOwnSide(byColor, tr)) {
    for (const [dr, dc] of DIAG) {
      const r = tr + dr * 2
      const c = tc + dc * 2
      if (!inBoard(r, c)) continue
      const p = board[squareOf(r, c)]
      if (!p || p.color !== byColor || p.type !== 'B') continue
      if (!board[squareOf(tr + dr, tc + dc)]) return true
    }
  }

  // 马：反推马的位置，再检查马腿。
  for (const [dr, dc, lr, lc] of HORSE) {
    const hr = tr - dr
    const hc = tc - dc
    if (!inBoard(hr, hc)) continue
    const p = board[squareOf(hr, hc)]
    if (!p || p.color !== byColor || p.type !== 'N') continue
    if (!board[squareOf(hr + lr, hc + lc)]) return true
  }

  // 车/炮：沿四个方向找第一个子和第二个子。
  for (const [dr, dc] of ORTHO) {
    let r = tr + dr
    let c = tc + dc
    while (inBoard(r, c) && !board[squareOf(r, c)]) {
      r += dr
      c += dc
    }
    if (!inBoard(r, c)) continue

    const first = board[squareOf(r, c)]
    if (first && first.color === byColor && first.type === 'R') return true

    let r2 = r + dr
    let c2 = c + dc
    while (inBoard(r2, c2) && !board[squareOf(r2, c2)]) {
      r2 += dr
      c2 += dc
    }
    if (!inBoard(r2, c2)) continue
    const second = board[squareOf(r2, c2)]
    if (second && second.color === byColor && second.type === 'C') return true
  }

  return false
}
