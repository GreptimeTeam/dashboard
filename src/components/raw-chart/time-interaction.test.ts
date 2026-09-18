import { describe, expect, it } from 'vitest'
import {
  GRAFANA_MIN_PAN_DIST_PX,
  GRAFANA_MIN_ZOOM_DIST_PX,
  buildPanPreviewTimeAxis,
  computeCategoryPanExtent,
  computePanRange,
  computeZoomOutRange,
  isModifierBlockedZoom,
  plotPixelToTimeMs,
  toUnixTimeRangeSeconds,
} from './time-interaction'

describe('raw-chart time-interaction (Grafana rules)', () => {
  it('uses Grafana 5px min zoom / pan distance', () => {
    expect(GRAFANA_MIN_ZOOM_DIST_PX).toBe(5)
    expect(GRAFANA_MIN_PAN_DIST_PX).toBe(5)
  })

  it('blocks ctrl/meta zoom like maybeZoomAction', () => {
    expect(isModifierBlockedZoom({ ctrlKey: true, metaKey: false } as MouseEvent)).toBe(true)
    expect(isModifierBlockedZoom({ ctrlKey: false, metaKey: true } as MouseEvent)).toBe(true)
    expect(isModifierBlockedZoom({ ctrlKey: false, metaKey: false } as MouseEvent)).toBe(false)
  })

  it('zooms out 2x around center on double-click', () => {
    expect(computeZoomOutRange(1000, 2000)).toEqual({ fromMs: 500, toMs: 2500 })
  })

  it('pans earlier when dragging x-axis to the right', () => {
    expect(computePanRange(10_000, 11_000, 100, 200)).toEqual({ fromMs: 9500, toMs: 10_500 })
  })

  it('converts ms window to unix seconds for Topbar/ctx', () => {
    expect(toUnixTimeRangeSeconds({ fromMs: 1500, toMs: 3500 })).toEqual([1, 3])
    expect(toUnixTimeRangeSeconds({ fromMs: 1000, toMs: 1000 })).toBeNull()
  })

  it('maps heatmap plot pixels onto the query window (category axis has no time scale)', () => {
    const window = { fromMs: 1_000, toMs: 5_000 }
    expect(plotPixelToTimeMs(100, 100, 400, window)).toBe(1_000)
    expect(plotPixelToTimeMs(300, 100, 400, window)).toBe(3_000)
    expect(plotPixelToTimeMs(500, 100, 400, window)).toBe(5_000)
    expect(plotPixelToTimeMs(100, 100, 0, window)).toBeNull()
  })

  it('shifts heatmap category extent so cells follow an x-axis drag', () => {
    expect(computeCategoryPanExtent(10, 50, 100)).toEqual({ min: -5, max: 4 })
    expect(computeCategoryPanExtent(10, 0, 100)).toBeNull()
  })

  it('keeps absolute tick times while panning so labels slide, and fills the new edge', () => {
    const originFrom = 1_000_000
    const originTo = 1_600_000
    const intervalMs = 100_000
    const origin = buildPanPreviewTimeAxis(originFrom, originTo, {
      plotWidthPx: 400,
      phaseMs: originFrom,
      intervalMs,
    })
    const pannedFrom = 750_000
    const pannedTo = 1_350_000
    const panned = buildPanPreviewTimeAxis(pannedFrom, pannedTo, {
      plotWidthPx: 400,
      phaseMs: originFrom,
      intervalMs,
    })

    expect(panned.min).toBe(pannedFrom)
    expect(panned.max).toBe(pannedTo)
    expect(origin.ticks).toEqual([1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000, 1_500_000])

    const stillVisible = origin.ticks.filter((tick) => tick >= pannedFrom && tick < pannedTo)
    expect(stillVisible).toEqual([1_000_000, 1_100_000, 1_200_000, 1_300_000])
    expect(stillVisible.every((tick) => panned.ticks.includes(tick))).toBe(true)

    expect(panned.ticks).toEqual([800_000, 900_000, 1_000_000, 1_100_000, 1_200_000, 1_300_000])
    expect(panned.ticks[0]).not.toBe(pannedFrom)
  })
})
