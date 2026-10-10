import { describe, expect, it } from 'vitest'
import {
  grafanaAutoIntervalSeconds,
  grafanaRoundIntervalMs,
  inferVolumeStepMs,
  volumeAxisLabelCount,
  volumeBarWidthPx,
} from './volume-step'

describe('grafana log volume step', () => {
  it('rounds 4.5s to 5s like Grafana roundInterval', () => {
    expect(grafanaRoundIntervalMs(4500)).toBe(5000)
  })

  it('uses a 5s bucket for a 30m window at ~400px (dense bars, sparse ticks)', () => {
    expect(grafanaAutoIntervalSeconds(30 * 60 * 1000, 400)).toBe(5)
  })

  it('falls back to 400px when the plot has not been measured', () => {
    expect(grafanaAutoIntervalSeconds(30 * 60 * 1000, 0)).toBe(5)
  })
})

describe('log volume axis label count', () => {
  it('fits fewer HH:mm labels on a narrow plot than on a wide one', () => {
    expect(volumeAxisLabelCount(200)).toBeLessThan(6)
    expect(volumeAxisLabelCount(200)).toBeLessThan(volumeAxisLabelCount(420))
  })
})

describe('log volume bar width', () => {
  it('sizes bars from the bucket step so sparse rows do not overlap', () => {
    const spanMs = 30 * 60 * 1000
    const stepMs = 5 * 1000
    const width = volumeBarWidthPx(200, spanMs, stepMs)
    expect(width).toBeLessThanOrEqual(1)
    expect(volumeBarWidthPx(200, spanMs, 60 * 1000)).toBeLessThanOrEqual(4)
  })

  it('infers the step from consecutive unix-second points', () => {
    expect(
      inferVolumeStepMs([
        [1_000, 1],
        [1_005, 2],
        [1_020, 1],
      ])
    ).toBe(5000)
  })
})
