import type { ECharts } from 'echarts'
import formatTimeAxisLabel, {
  generateAlignedTimeAxisTicks,
  pickTimeAxisIntervalMs,
  SPARKLINE_AXIS_PLOT_WIDTH_PX,
} from '../../utils/chart-time-axis'

/** Grafana ZoomPlugin `MIN_ZOOM_DIST` — ignore thinner selections. */
export const GRAFANA_MIN_ZOOM_DIST_PX = 5

/** Grafana XAxisInteractionAreaPlugin `MIN_PAN_DIST`. */
export const GRAFANA_MIN_PAN_DIST_PX = 5

const ZOOM_SELECT_GRAPHIC_ID = 'raw-chart-zoom-select'

export type ChartTimeRangeMs = { fromMs: number; toMs: number }

export type PanPreviewTimeAxisOptions = {
  /** Plot width for tick density. */
  plotWidthPx?: number
  /**
   * Tick phase anchor (usually pan-start `fromMs`).
   * Keeps absolute tick times stable so labels slide with the axis instead of
   * regenerating values in place (Grafana x-axis drag).
   */
  phaseMs?: number
  /** Lock interval to the pre-pan axis when provided. */
  intervalMs?: number
}

/**
 * Pan-preview time axis: shift `min`/`max`, extend `customValues` on the origin phase grid.
 * Existing labels keep the same timestamps (horizontal slide); new edges get filled ticks.
 */
export function buildPanPreviewTimeAxis(fromMs: number, toMs: number, options: PanPreviewTimeAxisOptions = {}) {
  const plotWidthPx = options.plotWidthPx ?? SPARKLINE_AXIS_PLOT_WIDTH_PX
  const spanMs = Math.max(0, toMs - fromMs)
  const intervalMs = options.intervalMs ?? pickTimeAxisIntervalMs(spanMs, plotWidthPx)
  const phaseMs = options.phaseMs ?? fromMs
  const ticks = generateAlignedTimeAxisTicks(fromMs, toMs, intervalMs, phaseMs)
  return {
    min: fromMs,
    max: toMs,
    minInterval: intervalMs,
    maxInterval: intervalMs,
    interval: intervalMs,
    axisTick: {
      customValues: ticks,
    },
    axisLabel: {
      customValues: ticks,
      formatter: (value: number | string) => formatTimeAxisLabel(Number(value), spanMs, intervalMs),
    },
    ticks,
    intervalMs,
    phaseMs,
  }
}

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

type XAxisOption = {
  type?: string
  min?: number
  max?: number
  interval?: number
  data?: unknown[]
  axisLabel?: { customValues?: number[] }
  /** Set by `buildHeatmapOption` — lets the pan preview slide/complete time labels. */
  rawChartTimeTicks?: RawChartCategoryTimeTicks
}

function readPrimaryXAxis(chart: ECharts): XAxisOption | null {
  try {
    const option = chart.getOption() as { xAxis?: XAxisOption[] | XAxisOption }
    const axis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
    return axis ?? null
  } catch {
    return null
  }
}

/** True when x is category (ECharts heatmap — cells require category, not time). */
export function isCategoryXAxis(chart: ECharts): boolean {
  return readPrimaryXAxis(chart)?.type === 'category'
}

export function readCategoryCount(chart: ECharts): number {
  const data = readPrimaryXAxis(chart)?.data
  return Array.isArray(data) ? data.length : 0
}

export function readAxisWindowMs(chart: ECharts): ChartTimeRangeMs | null {
  const axis = readPrimaryXAxis(chart)
  // Category min/max are ranks, not timestamps.
  if (!axis || axis.type === 'category') {
    return null
  }
  const fromMs = Number(axis.min)
  const toMs = Number(axis.max)
  if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
    return { fromMs, toMs }
  }
  return null
}

/**
 * Map a plot pixel onto an authoritative time window.
 * Category axes cannot use `convertFromPixel` — that returns a rank, not a timestamp.
 */
export function plotPixelToTimeMs(
  pixelX: number,
  gridX: number,
  plotWidthPx: number,
  window: ChartTimeRangeMs
): number | null {
  if (!(plotWidthPx > 0) || !(window.toMs > window.fromMs)) {
    return null
  }
  const ratio = (pixelX - gridX) / plotWidthPx
  return window.fromMs + ratio * (window.toMs - window.fromMs)
}

/**
 * Shift a category axis so cells follow the drag (ECharts heatmap).
 * Grafana heatmap pans a real time scale via `u.setScale`; ECharts heatmap cannot —
 * it only renders cells on category x, so preview shifts category min/max instead.
 * ECharts parses category min/max as integer ranks (`scale.parse` → `Math.round`),
 * so the window is snapped to whole bands with the span kept at `count - 1`:
 * cells keep their size and slide band-by-band in the drag direction.
 */
export function computeCategoryPanExtent(
  categoryCount: number,
  dragDxPx: number,
  plotWidthPx: number
): { min: number; max: number } | null {
  if (!(categoryCount > 1) || !(plotWidthPx > 0) || dragDxPx === 0) {
    return null
  }
  const shift = (dragDxPx / plotWidthPx) * categoryCount
  const min = Math.round(-shift)
  return {
    min,
    max: min + categoryCount - 1,
  }
}

function readGridRectFromModel(chart: ECharts): { x: number; y: number; width: number; height: number } | null {
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
  return null
}

export function getGridRect(chart: ECharts): { x: number; y: number; width: number; height: number } | null {
  const fromModel = readGridRectFromModel(chart)
  if (fromModel) {
    return fromModel
  }

  // Time axis: convert window corners.
  const window = readAxisWindowMs(chart)
  if (window) {
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
      if (topLeft && bottomRight) {
        const x = Math.min(topLeft[0], bottomRight[0])
        const y = Math.min(topLeft[1], bottomRight[1])
        const width = Math.abs(bottomRight[0] - topLeft[0])
        const height = Math.abs(bottomRight[1] - topLeft[1])
        if (width > 0 && height > 0) {
          return { x, y, width, height }
        }
      }
    } catch {
      // fall through
    }
  }

  // Category axis (heatmap): convert first/last category indexes.
  const categoryCount = readCategoryCount(chart)
  if (categoryCount > 1) {
    try {
      const yCount = (() => {
        try {
          const option = chart.getOption() as { yAxis?: { data?: unknown[] } | Array<{ data?: unknown[] }> }
          const yAxis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis
          return Array.isArray(yAxis?.data) ? yAxis.data.length : 0
        } catch {
          return 0
        }
      })()
      const y0 = 0
      const y1 = Math.max(0, yCount - 1)
      const topLeft = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [0, y1])
      const bottomRight = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [categoryCount - 1, y0])
      if (topLeft && bottomRight) {
        const x = Math.min(topLeft[0], bottomRight[0])
        const y = Math.min(topLeft[1], bottomRight[1])
        const width = Math.abs(bottomRight[0] - topLeft[0])
        const height = Math.abs(bottomRight[1] - topLeft[1])
        if (width > 0 && height > 0) {
          return { x, y, width, height }
        }
      }
    } catch {
      return null
    }
  }

  return null
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

/**
 * Preview a panned time window (Grafana `u.setScale('x', {min,max})`).
 * Locks the plot rect so ECharts `containLabel` cannot reflow the chart while labels slide.
 */
export function previewAxisWindow(chart: ECharts, fromMs: number, toMs: number, phaseMs?: number) {
  const plotRect = getGridRect(chart)
  const plotWidthPx = plotRect?.width ?? SPARKLINE_AXIS_PLOT_WIDTH_PX
  const axis = readPrimaryXAxis(chart)
  const existingInterval = Number(axis && 'interval' in axis ? axis.interval : Number.NaN)
  const {
    ticks: _ticks,
    intervalMs: _intervalMs,
    phaseMs: _phaseMs,
    ...xAxis
  } = buildPanPreviewTimeAxis(fromMs, toMs, {
    plotWidthPx,
    phaseMs: phaseMs ?? fromMs,
    intervalMs: Number.isFinite(existingInterval) && existingInterval > 0 ? existingInterval : undefined,
  })
  chart.setOption(
    {
      // Grafana keeps a fixed plot bbox during pan; ECharts containLabel would otherwise
      // remasure labels every frame and shift the whole chart (often upward).
      ...(plotRect
        ? {
            grid: {
              containLabel: false,
              left: plotRect.x,
              top: plotRect.y,
              width: plotRect.width,
              height: plotRect.height,
            },
          }
        : {}),
      xAxis,
    },
    false
  )
}

/**
 * Category-axis time-tick metadata (set by `buildHeatmapOption`).
 * The pan preview reuses the static tick grid (`phaseMs + k * intervalMs`) so
 * label times keep their absolute values and slide with the drag — the same
 * rules as the timeseries time-axis pan — and fills the exposed edge with
 * continuation ticks instead of leaving it blank.
 */
export interface RawChartCategoryTimeTicks {
  /** Locked tick interval (ms) from the pre-drag axis. */
  intervalMs: number
  /** Phase anchor (pre-drag window start) keeping tick times absolute. */
  phaseMs: number
  /** Pre-drag window span (ms) — drives day-scale label formats. */
  spanMs: number
  /** Rest-state label handlers, re-applied when a drag aborts. */
  staticAxisLabel: {
    interval: (index: number) => boolean
    formatter: (value: unknown, index: number) => string
  }
}

export interface CategoryPanLabelHandlers {
  interval: (index: number) => boolean
  formatter: (value: unknown, index: number) => string
}

/**
 * Time labels for a panned category axis (ECharts heatmap x drag).
 * Category labels can only render on band positions, so ticks from the phase
 * grid map onto the uniform band grid (`bandMs[0] + rank * stepMs`): existing
 * labels keep their times, and the leading edge exposed by the drag (e.g. the
 * left side when dragging right) is filled with continuation ticks.
 */
export function buildPanPreviewCategoryLabels(
  bandTimesMs: number[],
  extent: { min: number; max: number },
  ticks: RawChartCategoryTimeTicks
): CategoryPanLabelHandlers | null {
  const firstBandMs = Number(bandTimesMs[0])
  const stepMs = bandTimesMs.length >= 2 ? Number(bandTimesMs[1]) - Number(bandTimesMs[0]) : Number.NaN
  if (!Number.isFinite(firstBandMs) || !(stepMs > 0) || !(ticks.intervalMs > 0)) {
    return null
  }
  // Time window covered by the shifted extent (uniform bands, boundaryGap halves aside).
  const fromMs = firstBandMs + extent.min * stepMs
  const toMs = firstBandMs + (extent.max + 1) * stepMs
  const labelByRank = new Map<number, number>()
  generateAlignedTimeAxisTicks(fromMs, toMs, ticks.intervalMs, ticks.phaseMs).forEach((tickMs) => {
    const rank = Math.round((tickMs - firstBandMs) / stepMs)
    // One label per band; when the tick grid is denser than the bands keep the first tick.
    if (!labelByRank.has(rank)) {
      labelByRank.set(rank, tickMs)
    }
  })
  return {
    // `interval` receives the absolute band rank.
    interval: (index: number) => labelByRank.has(index),
    // `formatter` receives an extent-relative index (tickValue - scaleExtent[0]).
    formatter: (_value: unknown, index: number) => {
      const tickMs = labelByRank.get(index + extent.min)
      return tickMs != null ? formatTimeAxisLabel(tickMs, ticks.spanMs, ticks.intervalMs) : ''
    },
  }
}

function previewCategoryExtent(chart: ECharts, extent: { min: number; max: number }) {
  const plotRect = getGridRect(chart)
  const axis = readPrimaryXAxis(chart)
  const bandTimesMs = Array.isArray(axis?.data) ? axis.data.map(Number) : []
  const meta = axis?.rawChartTimeTicks
  const labels = meta ? buildPanPreviewCategoryLabels(bandTimesMs, extent, meta) : null
  chart.setOption(
    {
      // Same containLabel lock as time-axis pan — otherwise remasure jumps the plot.
      ...(plotRect
        ? {
            grid: {
              containLabel: false,
              left: plotRect.x,
              top: plotRect.y,
              width: plotRect.width,
              height: plotRect.height,
            },
          }
        : {}),
      xAxis: {
        min: extent.min,
        max: extent.max,
        // Slide labels with the drag and complete the exposed edge on the phase grid.
        ...(labels ? { axisLabel: labels } : {}),
      },
    },
    false
  )
}

function restoreCategoryExtent(chart: ECharts) {
  const count = readCategoryCount(chart)
  if (!(count > 0)) {
    return
  }
  const meta = readPrimaryXAxis(chart)?.rawChartTimeTicks
  const plotRect = getGridRect(chart)
  chart.setOption(
    {
      ...(plotRect
        ? {
            grid: {
              containLabel: false,
              left: plotRect.x,
              top: plotRect.y,
              width: plotRect.width,
              height: plotRect.height,
            },
          }
        : {}),
      xAxis: {
        min: 0,
        max: count - 1,
        // Drop the pan label handlers so the rest-state labels render again.
        ...(meta ? { axisLabel: meta.staticAxisLabel } : {}),
      },
    },
    false
  )
}

function categorySampleWindow(chart: ECharts): ChartTimeRangeMs | null {
  const data = readPrimaryXAxis(chart)?.data
  if (!Array.isArray(data) || data.length < 2) {
    return null
  }
  const fromMs = Number(data[0])
  const toMs = Number(data[data.length - 1])
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || !(toMs > fromMs)) {
    return null
  }
  return { fromMs, toMs }
}

function resolveZoomRangeMs(
  chart: ECharts,
  leftPx: number,
  rightPx: number,
  midY: number,
  gridX: number,
  plotWidthPx: number,
  window: ChartTimeRangeMs | null
): ChartTimeRangeMs | null {
  if (!isCategoryXAxis(chart)) {
    const fromMs = pixelToTimeMs(chart, leftPx, midY)
    const toMs = pixelToTimeMs(chart, rightPx, midY)
    if (fromMs == null || toMs == null || !(toMs > fromMs)) {
      return null
    }
    return { fromMs, toMs }
  }

  const source = window && window.toMs > window.fromMs ? window : categorySampleWindow(chart)
  if (!source) {
    return null
  }
  const fromMs = plotPixelToTimeMs(leftPx, gridX, plotWidthPx, source)
  const toMs = plotPixelToTimeMs(rightPx, gridX, plotWidthPx, source)
  if (fromMs == null || toMs == null || !(toMs > fromMs)) {
    return null
  }
  return { fromMs, toMs }
}

function hideTip(chart: ECharts) {
  try {
    chart.dispatchAction({ type: 'hideTip' })
  } catch {
    // chart may be disposed
  }
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
export function attachTimeInteraction(
  chart: ECharts,
  handlers: TimeInteractionHandlers
): {
  destroy: () => void
  onAxisPointerDown: (e: PointerEvent) => void
} {
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

      hideTip(chart)

      if (mode === 'zoom') {
        const clamped = Math.min(gridX + plotWidthPx, Math.max(gridX, localX))
        drawZoomGraphic(chart, gridY, gridHeight, startLocalX, clamped)
        return
      }

      if (mode === 'pan' && panOrigin) {
        const next = computePanRange(panOrigin.fromMs, panOrigin.toMs, dx, plotWidthPx)
        if (!next) {
          return
        }
        // ECharts heatmap is category-x only; Grafana-style setScale is timeseries path.
        if (isCategoryXAxis(chart)) {
          const extent = computeCategoryPanExtent(readCategoryCount(chart), dx, plotWidthPx)
          if (extent) {
            previewCategoryExtent(chart, extent)
          }
          return
        }
        previewAxisWindow(chart, next.fromMs, next.toMs, panOrigin.fromMs)
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
        requestAnimationFrame(() => setLock(false))
      }

      const abort = (restore?: ChartTimeRangeMs) => {
        if (isCategoryXAxis(chart)) {
          restoreCategoryExtent(chart)
        } else if (restore) {
          previewAxisWindow(chart, restore.fromMs, restore.toMs, restore.fromMs)
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
        const range = resolveZoomRangeMs(chart, left, right, midY, gridX, width, handlers.getTimeWindowMs())
        if (!range) {
          abort()
          return
        }
        commit(range)
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
