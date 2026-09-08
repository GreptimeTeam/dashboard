import { describe, expect, it } from 'vitest'
import {
  GRAFANA_MIN_PAN_DIST_PX,
  GRAFANA_MIN_ZOOM_DIST_PX,
  computePanRange,
  computeZoomOutRange,
  isModifierBlockedZoom,
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
})
