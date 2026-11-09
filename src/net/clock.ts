import type { Color } from '../game/types'

/**
 * 对局时限配置（毫秒）。
 * - perMoveMs：每步限时，每一步重新倒计时，超时判负。
 * - totalMs：每位玩家各自的总用时，只在自己走棋时消耗，用完判负。
 * 两者都可为 null（不启用），也可以同时启用。
 */
export interface TimeControl {
  perMoveMs: number | null
  totalMs: number | null
}

export const TIME_CONTROL_OFF: TimeControl = { perMoveMs: null, totalMs: null }

/** 大厅可选的预设时长（分钟）。 */
export const PER_MOVE_PRESETS_MIN = [1, 3, 5, 10]
export const TOTAL_PRESETS_MIN = [5, 10, 15, 30]

export function hasClock(tc: TimeControl | null | undefined): boolean {
  return !!tc && (tc.perMoveMs != null || tc.totalMs != null)
}

/** 毫秒转 分:秒，超过 1 小时显示 时:分:秒。向上取整，归零显示 00:00。 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export interface ClockEvaluation {
  perMoveRemaining: number | null
  totalRemaining: number | null
  /** 哪一个计时先到 0；未超时为 null。 */
  expiredBy: 'perMove' | 'total' | null
}

/**
 * 计算当前回合的剩余时间与超时来源。
 * @param perMoveMs 每步限时（null=未启用）
 * @param totalMs 总用时上限（null=未启用）
 * @param activeTotalMs 当前行棋方在本回合开始时的剩余总用时
 * @param elapsedMs 本回合已用时长
 */
export function evaluateClock(
  perMoveMs: number | null,
  totalMs: number | null,
  activeTotalMs: number | null,
  elapsedMs: number,
): ClockEvaluation {
  const elapsed = Math.max(0, elapsedMs)
  const perMoveRemaining = perMoveMs != null ? perMoveMs - elapsed : null
  const totalRemaining =
    totalMs != null && activeTotalMs != null ? activeTotalMs - elapsed : null

  const thresholds: Array<{ kind: 'perMove' | 'total'; at: number }> = []
  if (perMoveMs != null) thresholds.push({ kind: 'perMove', at: perMoveMs })
  if (totalMs != null && activeTotalMs != null) {
    thresholds.push({ kind: 'total', at: activeTotalMs })
  }
  thresholds.sort((a, b) => a.at - b.at)
  const expired = thresholds.find((item) => elapsed >= item.at)
  const expiredBy = expired ? expired.kind : null

  return { perMoveRemaining, totalRemaining, expiredBy }
}

/** 行棋方超时后，胜方对应的对局状态。 */
export function statusForTimeout(loser: Color): 'red_wins' | 'black_wins' {
  return loser === 'red' ? 'black_wins' : 'red_wins'
}

/** 分钟转毫秒；非法/非正数返回 null。 */
export function minutesToMs(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  return Math.round(minutes * 60_000)
}

/** 毫秒转分钟（用于回显自定义输入），非整分钟会四舍五入。 */
export function msToMinutes(ms: number | null): number | null {
  return ms == null ? null : Math.round(ms / 60_000)
}
