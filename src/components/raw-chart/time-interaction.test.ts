import { describe, expect, it } from 'vitest'
import {
  GRAFANA_MIN_PAN_DIST_PX,
  GRAFANA_MIN_ZOOM_DIST_PX,
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
})
