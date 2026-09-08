import type { ECharts } from 'echarts'

/** Grafana ZoomPlugin `MIN_ZOOM_DIST` — ignore thinner selections. */
export const GRAFANA_MIN_ZOOM_DIST_PX = 5

/** Grafana XAxisInteractionAreaPlugin `MIN_PAN_DIST`. */
export const GRAFANA_MIN_PAN_DIST_PX = 5

const ZOOM_SELECT_GRAPHIC_ID = 'raw-chart-zoom-select'

export type ChartTimeRangeMs = { fromMs: number; toMs: number }

export function isModifierBlockedZoom(event: MouseEvent | PointerEvent | null | undefined): boolean {
  return Boolean(event && (event.ctrlKey || event.metaKey))
}

/** Expand range 2× around center (Grafana double-click zoom-out). */
export function computeZoomOutRange(fromMs: number, toMs: number): ChartTimeRangeMs {
  const span = Math.max(0, toMs - fromMs)
  const pad = span / 2
  return { fromMs: fromMs - pad, toMs: toMs + pad }
}

/**
 * Pan window so content follows the drag (Grafana x-axis drag).
 * Drag right (+dx) → earlier times.
 */
export function computePanRange(
  fromMs: number,
  toMs: number,
  dragDxPx: number,
  plotWidthPx: number
): ChartTimeRangeMs | null {
  if (!(plotWidthPx > 0) || dragDxPx === 0) {
    return null
  }
  const span = Math.max(0, toMs - fromMs)
  if (!(span > 0)) {
    return null
  }
  const shiftMs = -(dragDxPx / plotWidthPx) * span
  return { fromMs: fromMs + shiftMs, toMs: toMs + shiftMs }
}

/** Convert ms window → unix-seconds pair for app time-range state. */
export function toUnixTimeRangeSeconds(range: ChartTimeRangeMs): [number, number] | null {
  const start = Math.floor(range.fromMs / 1000)
  const end = Math.floor(range.toMs / 1000)
  if (!(end > start)) {
    return null
  }
  return [start, end]
}

export function readAxisWindowMs(chart: ECharts): ChartTimeRangeMs | null {
  try {
    const option = chart.getOption() as {
      xAxis?: Array<{ min?: number; max?: number }> | { min?: number; max?: number }
    }
    const axis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
    const fromMs = Number(axis?.min)
    const toMs = Number(axis?.max)
    if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
      return { fromMs, toMs }
    }
  } catch {
    // ignore
  }
  return null
}

export function getGridRect(chart: ECharts): { x: number; y: number; width: number; height: number } | null {
  const window = readAxisWindowMs(chart)
  if (!window) {
    return null
  }

  try {
    const model = chart.getModel() as {
      getComponent?: (
        name: string,
        index: number
      ) => { coordinateSystem?: { getRect?: () => { x: number; y: number; width: number; height: number } } }
    }
    const rect = model.getComponent?.('grid', 0)?.coordinateSystem?.getRect?.()
    if (rect && rect.width > 0 && rect.height > 0) {
      return rect
    }
  } catch {
    // fall through
  }

  try {
    const yModel = (
      chart.getModel() as {
        getComponent?: (name: string, index: number) => { axis?: { scale?: { getExtent?: () => number[] } } }
      }
    ).getComponent?.('yAxis', 0)
    const yExtent = yModel?.axis?.scale?.getExtent?.()
    const y0 = yExtent?.[0] ?? 0
    const y1 = yExtent?.[1] ?? 1
    const topLeft = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [window.fromMs, y1])
    const bottomRight = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [window.toMs, y0])
    if (!topLeft || !bottomRight) {
      return null
    }
    const x = Math.min(topLeft[0], bottomRight[0])
    const y = Math.min(topLeft[1], bottomRight[1])
    const width = Math.abs(bottomRight[0] - topLeft[0])
    const height = Math.abs(bottomRight[1] - topLeft[1])
    if (!(width > 0) || !(height > 0)) {
      return null
    }
    return { x, y, width, height }
  } catch {
    return null
  }
}

function pixelToTimeMs(chart: ECharts, pixelX: number, pixelY: number): number | null {
  try {
    const values = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pixelX, pixelY])
    const time = Array.isArray(values) ? Number(values[0]) : Number.NaN
    return Number.isFinite(time) ? time : null
  } catch {
    return null
  }
}

function clearZoomGraphic(chart: ECharts) {
  try {
    chart.setOption(
      {
        graphic: [
          {
            id: ZOOM_SELECT_GRAPHIC_ID,
            $action: 'remove',
            type: 'rect',
          },
        ],
      },
      false
    )
  } catch {
    // chart may be disposed
  }
}

function drawZoomGraphic(chart: ECharts, gridY: number, gridHeight: number, left: number, right: number) {
  const x = Math.min(left, right)
  const width = Math.abs(right - left)
  chart.setOption(
    {
      graphic: [
        {
          id: ZOOM_SELECT_GRAPHIC_ID,
          type: 'rect',
          shape: {
            x,
            y: gridY,
            width,
            height: gridHeight,
          },
          style: {
            fill: 'rgba(112, 47, 237, 0.12)',
            stroke: 'rgba(112, 47, 237, 0.45)',
            lineWidth: 1,
          },
          silent: true,
          z: 100,
        },
      ],
    },
    false
  )
}

export function previewAxisWindow(chart: ECharts, fromMs: number, toMs: number) {
  chart.setOption(
    {
      xAxis: {
        min: fromMs,
        max: toMs,
      },
    },
    false
  )
}

export interface TimeInteractionHandlers {
  /** Authoritative query window (ms). Prefer over reading axis option. */
  getTimeWindowMs: () => ChartTimeRangeMs | null
  /** Called on pan/zoom commit. */
  onTimeRangeMs: (range: ChartTimeRangeMs) => void
  /** While true, host should not push option updates that reset the axis. */
  onInteractionLock?: (locked: boolean) => void
  isEnabled?: () => boolean
}

type DragMode = 'zoom' | 'pan'

/**
 * Grafana-style plot zoom + x-axis pan.
 * Uses document pointer listeners so release outside the canvas still commits.
 */
export function attachTimeInteraction(chart: ECharts, handlers: TimeInteractionHandlers): () => void {
  const dom = chart.getDom()

  let mode: DragMode | null = null
  let startClientX = 0
  let startLocalX = 0
  let plotWidthPx = 0
  let gridX = 0
  let gridY = 0
  let gridHeight = 0
  let panOrigin: ChartTimeRangeMs | null = null
  let activeMove: ((e: PointerEvent) => void) | null = null
  let activeUp: ((e: PointerEvent) => void) | null = null

  const setLock = (locked: boolean) => {
    handlers.onInteractionLock?.(locked)
  }

  const clearDocumentListeners = () => {
    if (activeMove) {
      document.removeEventListener('pointermove', activeMove)
      activeMove = null
    }
    if (activeUp) {
      document.removeEventListener('pointerup', activeUp)
      document.removeEventListener('pointercancel', activeUp)
      activeUp = null
    }
  }

  const localXFromClient = (clientX: number) => {
    const bounds = dom.getBoundingClientRect()
    return clientX - bounds.left
  }

  const localYFromClient = (clientY: number) => {
    const bounds = dom.getBoundingClientRect()
    return clientY - bounds.top
  }

  const beginDrag = (e: PointerEvent, nextMode: DragMode, origin: ChartTimeRangeMs | null) => {
    if (handlers.isEnabled && !handlers.isEnabled()) {
      return
    }
    if (e.button !== 0 || isModifierBlockedZoom(e)) {
      return
    }

    const rect = getGridRect(chart)
    if (!rect || !(rect.width > 0)) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    clearDocumentListeners()

    mode = nextMode
    startClientX = e.clientX
    startLocalX = localXFromClient(e.clientX)
    plotWidthPx = rect.width
    gridX = rect.x
    gridY = rect.y
    gridHeight = rect.height
    panOrigin = origin ? { ...origin } : null
    setLock(true)

    const onMove = (moveEvent: PointerEvent) => {
      if (!mode) {
        return
      }
      moveEvent.preventDefault()
      const dx = moveEvent.clientX - startClientX
      const localX = localXFromClient(moveEvent.clientX)

      if (mode === 'zoom') {
        const clamped = Math.min(gridX + plotWidthPx, Math.max(gridX, localX))
        drawZoomGraphic(chart, gridY, gridHeight, startLocalX, clamped)
        return
      }

      if (mode === 'pan' && panOrigin) {
        const next = computePanRange(panOrigin.fromMs, panOrigin.toMs, dx, plotWidthPx)
        if (next) {
          previewAxisWindow(chart, next.fromMs, next.toMs)
        }
      }
    }

    const onUp = (upEvent: PointerEvent) => {
      const dx = upEvent.clientX - startClientX
      const localX = localXFromClient(upEvent.clientX)
      const active = mode
      const dragOrigin = panOrigin
      const width = plotWidthPx
      const midY = gridY + gridHeight / 2

      mode = null
      panOrigin = null
      clearDocumentListeners()
      clearZoomGraphic(chart)

      const commit = (range: ChartTimeRangeMs) => {
        handlers.onTimeRangeMs(range)
        // Keep lock until host applies new options; unlock on next frame as fallback.
        requestAnimationFrame(() => setLock(false))
      }

      const abort = (restore?: ChartTimeRangeMs) => {
        if (restore) {
          previewAxisWindow(chart, restore.fromMs, restore.toMs)
        }
        setLock(false)
      }

      if (active === 'zoom') {
        if (Math.abs(dx) < GRAFANA_MIN_ZOOM_DIST_PX) {
          abort()
          return
        }
        const left = Math.min(startLocalX, localX)
        const right = Math.max(startLocalX, localX)
        const fromMs = pixelToTimeMs(chart, left, midY)
        const toMs = pixelToTimeMs(chart, right, midY)
        if (fromMs == null || toMs == null || !(toMs > fromMs)) {
          abort()
          return
        }
        commit({ fromMs, toMs })
        return
      }

      if (active === 'pan' && dragOrigin) {
        if (Math.abs(dx) < GRAFANA_MIN_PAN_DIST_PX) {
          abort(dragOrigin)
          return
        }
        const next = computePanRange(dragOrigin.fromMs, dragOrigin.toMs, dx, width)
        if (next) {
          commit(next)
        } else {
          abort(dragOrigin)
        }
      } else {
        setLock(false)
      }
    }

    activeMove = onMove
    activeUp = onUp
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  /** Start pan from the dedicated x-axis overlay (Grafana `.u-axis` equivalent). */
  const onAxisPointerDown = (e: PointerEvent) => {
    const window = handlers.getTimeWindowMs() ?? readAxisWindowMs(chart)
    if (!window) {
      return
    }
    beginDrag(e, 'pan', window)
  }

  const onPlotPointerDown = (e: PointerEvent) => {
    // Axis overlay handles pan; ignore events that originated there.
    if ((e.target as HTMLElement | null)?.dataset?.rawChartAxisPan === '1') {
      return
    }
    if (handlers.isEnabled && !handlers.isEnabled()) {
      return
    }
    if (e.button !== 0 || isModifierBlockedZoom(e)) {
      return
    }
    const rect = getGridRect(chart)
    if (!rect) {
      return
    }
    const x = localXFromClient(e.clientX)
    const y = localYFromClient(e.clientY)
    const inPlot = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    if (!inPlot) {
      return
    }
    beginDrag(e, 'zoom', null)
  }

  const onDblClick = (e: MouseEvent) => {
    if (handlers.isEnabled && !handlers.isEnabled()) {
      return
    }
    if (isModifierBlockedZoom(e)) {
      return
    }
    const rect = getGridRect(chart)
    if (!rect) {
      return
    }
    const x = localXFromClient(e.clientX)
    const y = localYFromClient(e.clientY)
    const inPlot = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    if (!inPlot) {
      return
    }
    const window = handlers.getTimeWindowMs() ?? readAxisWindowMs(chart)
    if (!window) {
      return
    }
    handlers.onTimeRangeMs(computeZoomOutRange(window.fromMs, window.toMs))
  }

  dom.addEventListener('pointerdown', onPlotPointerDown)
  dom.addEventListener('dblclick', onDblClick)

  return {
    destroy: () => {
      clearDocumentListeners()
      dom.removeEventListener('pointerdown', onPlotPointerDown)
      dom.removeEventListener('dblclick', onDblClick)
      clearZoomGraphic(chart)
      setLock(false)
      mode = null
      panOrigin = null
    },
    onAxisPointerDown,
  }
}

export default attachTimeInteraction
