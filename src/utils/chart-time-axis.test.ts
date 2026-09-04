import { describe, expect, it } from 'vitest'
import formatTimeAxisLabel, {
  SPARKLINE_AXIS_PLOT_WIDTH_PX,
  calculateTimeAxisTicks,
  generateTimeAxisTicks,
  pickTimeAxisIntervalMs,
} from './chart-time-axis'

describe('chart-time-axis', () => {
  it('picks 5m ticks for 30m range on sparkline width (Grafana-like density)', () => {
    const rangeMs = 30 * 60 * 1000
    const intervalMs = pickTimeAxisIntervalMs(rangeMs, SPARKLINE_AXIS_PLOT_WIDTH_PX)
    expect(intervalMs).toBe(5 * 60 * 1000)
  })

  it('places the first tick at the axis start and omits the clipped end tick', () => {
    const start = new Date(2026, 0, 1, 10, 2, 0).getTime()
    const end = start + 30 * 60 * 1000
    const ticks = generateTimeAxisTicks(start, end, 5 * 60 * 1000)
    expect(ticks[0]).toBe(start)
    expect(ticks).toHaveLength(6)
    expect(ticks[ticks.length - 1]).toBe(start + 25 * 60 * 1000)
    expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1] === 5 * 60 * 1000)).toBe(true)
  })

  it('formats 30m / 5m ticks as HH:mm', () => {
    const ts = new Date(2026, 0, 1, 10, 15, 0).getTime()
    expect(formatTimeAxisLabel(ts, 30 * 60 * 1000, 5 * 60 * 1000)).toBe('10:15')
  })

  it('formats sub-minute ticks as HH:mm:ss', () => {
    const ts = new Date(2026, 0, 1, 10, 15, 30).getTime()
    expect(formatTimeAxisLabel(ts, 5 * 60 * 1000, 30 * 1000)).toBe('10:15:30')
  })

  it('returns tick set for sparkline option wiring', () => {
    const start = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const end = start + 30 * 60 * 1000
    const { intervalMs, ticks } = calculateTimeAxisTicks(start, end)
    expect(intervalMs).toBe(5 * 60 * 1000)
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    expect(ticks.length).toBeLessThanOrEqual(7)
  })
})
