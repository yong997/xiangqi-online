import { describe, expect, it } from 'vitest'
import {
  evaluateClock,
  formatClock,
  hasClock,
  minutesToMs,
  msToMinutes,
  TIME_CONTROL_OFF,
} from '../../src/net/clock'

describe('对局计时工具', () => {
  it('formatClock 补零与小时格式', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(1000)).toBe('00:01')
    expect(formatClock(59_000)).toBe('00:59')
    expect(formatClock(60_000)).toBe('01:00')
    expect(formatClock(3_600_000)).toBe('1:00:00')
    expect(formatClock(-5)).toBe('00:00')
  })

  it('hasClock 判断是否启用', () => {
    expect(hasClock(TIME_CONTROL_OFF)).toBe(false)
    expect(hasClock(null)).toBe(false)
    expect(hasClock({ perMoveMs: 60_000, totalMs: null })).toBe(true)
    expect(hasClock({ perMoveMs: null, totalMs: 300_000 })).toBe(true)
  })

  it('每步限时到点判超时', () => {
    expect(evaluateClock(60_000, null, null, 0)).toMatchObject({
      perMoveRemaining: 60_000,
      totalRemaining: null,
      expiredBy: null,
    })
    expect(evaluateClock(60_000, null, null, 59_000).expiredBy).toBeNull()
    expect(evaluateClock(60_000, null, null, 60_000).expiredBy).toBe('perMove')
  })

  it('总用时到点判超时', () => {
    const midway = evaluateClock(null, 300_000, 120_000, 119_000)
    expect(midway.totalRemaining).toBe(1000)
    expect(midway.expiredBy).toBeNull()
    expect(evaluateClock(null, 300_000, 120_000, 120_000).expiredBy).toBe('total')
  })

  it('两者同时启用时取先到者', () => {
    expect(evaluateClock(60_000, 300_000, 10_000, 15_000).expiredBy).toBe('total')
    expect(evaluateClock(60_000, 300_000, 900_000, 65_000).expiredBy).toBe('perMove')
  })

  it('分钟与毫秒互转', () => {
    expect(minutesToMs(3)).toBe(180_000)
    expect(minutesToMs(0)).toBeNull()
    expect(minutesToMs(null)).toBeNull()
    expect(msToMinutes(180_000)).toBe(3)
    expect(msToMinutes(null)).toBeNull()
  })
})
