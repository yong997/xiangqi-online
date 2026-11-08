import { useMemo } from 'react'
import { colOf, findKing, rowOf } from '../game/board'
import { PIECE_NAMES } from '../game/constants'
import { isInCheck } from '../game/rules'
import type { Board as BoardModel, Color, GameState, Move, Square } from '../game/types'

const CELL = 100
const MARGIN = 50
const WIDTH = MARGIN * 2 + CELL * 8
const HEIGHT = MARGIN * 2 + CELL * 9

const CANNON_MARKS: ReadonlyArray<[number, number]> = [
  [2, 1],
  [2, 7],
  [7, 1],
  [7, 7],
]

const PAWN_MARKS: ReadonlyArray<[number, number]> = [
  [3, 0],
  [3, 2],
  [3, 4],
  [3, 6],
  [3, 8],
  [6, 0],
  [6, 2],
  [6, 4],
  [6, 6],
  [6, 8],
]

interface BoardProps {
  game: GameState
  viewColor: Color
  selected: Square | null
  legal: ReadonlyArray<Square>
  interactive: boolean
  onSelect: (square: Square) => void
}

function displayPosition(square: Square, viewColor: Color): { x: number; y: number } {
  const row = viewColor === 'red' ? rowOf(square) : 9 - rowOf(square)
  const col = viewColor === 'red' ? colOf(square) : 8 - colOf(square)
  return { x: MARGIN + col * CELL, y: MARGIN + row * CELL }
}

function BoardMark({ x, y }: { x: number; y: number }) {
  const gap = 12
  const length = 13
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  return (
    <g className="board-mark" aria-hidden="true">
      {corners.map(([sx, sy]) => (
        <path
          key={`${sx}-${sy}`}
          d={`M ${x + sx * gap} ${y + sy * (gap + length)} L ${x + sx * gap} ${y + sy * gap} L ${x + sx * (gap + length)} ${y + sy * gap}`}
        />
      ))}
    </g>
  )
}

function PieceView({
  piece,
  square,
  x,
  y,
  selected,
  checked,
  interactive,
  onSelect,
}: {
  piece: NonNullable<BoardModel[number]>
  square: Square
  x: number
  y: number
  selected: boolean
  checked: boolean
  interactive: boolean
  onSelect: (square: Square) => void
}) {
  const label = PIECE_NAMES[piece.color][piece.type]
  return (
    <g
      className={`piece piece-${piece.color}${selected ? ' is-selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(square)
      }}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
      role="button"
      tabIndex={0}
      aria-label={`${piece.color === 'red' ? '红方' : '黑方'}${label}`}
    >
      <title>{`${piece.color === 'red' ? '红方' : '黑方'}${label}`}</title>
      {selected && <circle cx={x} cy={y} r={48} className="piece-selected-ring" />}
      {checked && <circle cx={x} cy={y} r={50} className="piece-check-ring" />}
      <circle cx={x} cy={y + 4} r={41} className="piece-shadow" />
      <circle cx={x} cy={y} r={41} className={`piece-face piece-face-${piece.color}`} />
      <circle cx={x} cy={y} r={34} className="piece-inner" />
      <text x={x} y={y} dy="0.35em" textAnchor="middle" className="piece-label">
        {label}
      </text>
    </g>
  )
}

export function Board({ game, viewColor, selected, legal, interactive, onSelect }: BoardProps) {
  const lastMove: Move | null =
    game.moves.length > 0 ? game.moves[game.moves.length - 1] : null

  const checkedKing = useMemo(() => {
    if (!isInCheck(game.board, game.turn)) return -1
    return findKing(game.board, game.turn)
  }, [game.board, game.turn])

  const marks = [...CANNON_MARKS, ...PAWN_MARKS]

  return (
    <div className="board-shell">
      <svg
        className="board-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="中国象棋棋盘"
      >
        <defs>
          <linearGradient id="board-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0d3a0" />
            <stop offset="45%" stopColor="#e6c188" />
            <stop offset="100%" stopColor="#d8ab6b" />
          </linearGradient>
          <radialGradient id="piece-face" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="65%" stopColor="#f6e6c6" />
            <stop offset="100%" stopColor="#e3c99c" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={26} fill="url(#board-wood)" />
        <rect
          x={22}
          y={22}
          width={WIDTH - 44}
          height={HEIGHT - 44}
          rx={16}
          className="board-frame"
        />

        <g className="board-grid" aria-hidden="true">
          {Array.from({ length: 10 }, (_, row) => {
            const y = MARGIN + row * CELL
            return <line key={`h-${row}`} x1={MARGIN} y1={y} x2={WIDTH - MARGIN} y2={y} />
          })}
          {Array.from({ length: 9 }, (_, col) => {
            const x = MARGIN + col * CELL
            if (col === 0 || col === 8) {
              return <line key={`v-${col}`} x1={x} y1={MARGIN} x2={x} y2={HEIGHT - MARGIN} />
            }
            return (
              <g key={`v-${col}`}>
                <line x1={x} y1={MARGIN} x2={x} y2={MARGIN + 4 * CELL} />
                <line x1={x} y1={MARGIN + 5 * CELL} x2={x} y2={HEIGHT - MARGIN} />
              </g>
            )
          })}
          <line
            x1={MARGIN + 3 * CELL}
            y1={MARGIN}
            x2={MARGIN + 5 * CELL}
            y2={MARGIN + 2 * CELL}
          />
          <line
            x1={MARGIN + 5 * CELL}
            y1={MARGIN}
            x2={MARGIN + 3 * CELL}
            y2={MARGIN + 2 * CELL}
          />
          <line
            x1={MARGIN + 3 * CELL}
            y1={MARGIN + 7 * CELL}
            x2={MARGIN + 5 * CELL}
            y2={MARGIN + 9 * CELL}
          />
          <line
            x1={MARGIN + 5 * CELL}
            y1={MARGIN + 7 * CELL}
            x2={MARGIN + 3 * CELL}
            y2={MARGIN + 9 * CELL}
          />
        </g>

        <text x={250} y={505} textAnchor="middle" className="river-text">
          楚 河
        </text>
        <text x={650} y={505} textAnchor="middle" className="river-text">
          汉 界
        </text>

        {marks.map(([row, col]) => (
          <BoardMark key={`${row}-${col}`} x={MARGIN + col * CELL} y={MARGIN + row * CELL} />
        ))}

        {/* 90 个透明点击区域，覆盖整个棋盘；棋子绘制在其上方优先接收点击。 */}
        {Array.from({ length: 90 }, (_, square) => {
          const { x, y } = displayPosition(square, viewColor)
          return (
            <rect
              key={`hit-${square}`}
              x={x - CELL / 2}
              y={y - CELL / 2}
              width={CELL}
              height={CELL}
              fill="transparent"
              onClick={() => onSelect(square)}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            />
          )
        })}

        {lastMove &&
          [lastMove.from, lastMove.to].map((square, index) => {
            const { x, y } = displayPosition(square, viewColor)
            return (
              <rect
                key={`last-${index}`}
                x={x - 40}
                y={y - 40}
                width={80}
                height={80}
                rx={12}
                className="last-move-mark"
              />
            )
          })}

        {game.board.map((piece, square) => {
          if (!piece) return null
          const { x, y } = displayPosition(square, viewColor)
          return (
            <PieceView
              key={`piece-${square}`}
              piece={piece}
              square={square}
              x={x}
              y={y}
              selected={selected === square}
              checked={checkedKing === square}
              interactive={interactive}
              onSelect={onSelect}
            />
          )
        })}

        {legal.map((square) => {
          const { x, y } = displayPosition(square, viewColor)
          const occupied = Boolean(game.board[square])
          return occupied ? (
            <circle key={`legal-${square}`} cx={x} cy={y} r={44} className="legal-capture" />
          ) : (
            <circle key={`legal-${square}`} cx={x} cy={y} r={13} className="legal-dot" />
          )
        })}
      </svg>
    </div>
  )
}
