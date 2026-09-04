import { describe, expect, it } from 'vitest'
import {
  SPARKLINE_MAX_DATA_POINTS,
  HEATMAP_MAX_DATA_POINTS,
  calculateSparklineIntervalMs,
  calculateSparklineQueryStep,
  estimateSparklinePointCount,
  roundInterval,
} from './sparkline-step'

describe('sparkline-step', () => {
  it('roundInterval matches Grafana buckets', () => {
    expect(roundInterval(7200)).toBe(5000)
    expect(roundInterval(60000)).toBe(60000)
  })

  it('uses fixed maxDataPoints for catalog sparklines', () => {
    expect(SPARKLINE_MAX_DATA_POINTS).toBe(30)
  })

  it('uses fewer maxDataPoints for catalog heatmaps (wider cells)', () => {
    expect(HEATMAP_MAX_DATA_POINTS).toBe(15)
    const rangeMs = 30 * 60 * 1000
    // 30m / 15 = 120s
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: HEATMAP_MAX_DATA_POINTS })).toBe(120_000)
    expect(calculateSparklineQueryStep([0, 30 * 60], { maxDataPoints: HEATMAP_MAX_DATA_POINTS })).toBe('120')
  })

  it('uses 1m step for 30m range (fixed maxDataPoints=30)', () => {
    const rangeMs = 30 * 60 * 1000
    const intervalMs = calculateSparklineIntervalMs(rangeMs)

    expect(intervalMs).toBe(60_000)
    expect(calculateSparklineQueryStep([0, 30 * 60])).toBe('60')

    const points = estimateSparklinePointCount(rangeMs, intervalMs)
    expect(points).toBe(31)
  })

  it('matches Grafana calculateInterval with fixed maxDataPoints=250 (MEDIUM)', () => {
    const rangeMs = 30 * 60 * 1000
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: 250 })).toBe(5000)
  })

  it('honors datasource min interval floor', () => {
    const rangeMs = 30 * 60 * 1000
    expect(calculateSparklineIntervalMs(rangeMs, { minIntervalMs: 120_000 })).toBe(120_000)
  })

  it('scales step with longer ranges', () => {
    // 6h / 30 = 720s → roundInterval → 600s (10m)
    expect(calculateSparklineQueryStep([0, 6 * 60 * 60])).toBe('600')
  })
})
