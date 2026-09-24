import { describe, expect, it } from 'vitest'
import * as echarts from 'echarts'
import formatTimeAxisLabel from '@/utils/chart-time-axis'
import { buildHeatmapOption } from './prom-chart'
import {
  buildPanPreviewCategoryLabels,
  computeCategoryPanExtent,
  type RawChartCategoryTimeTicks,
} from '@/components/raw-chart/time-interaction'

const STEP_SECONDS = 30
const N = 40 // data columns; expandHeatmapTimeGrid grows the grid to 41 (inclusive end)
const times = Array.from({ length: N }, (_, i) => 1_700_000_000 + i * STEP_SECONDS)
const heatmap = {
  times,
  buckets: ['0.1', '+Inf'],
  cells: times.map((_t, i) => [i, 0, (i % 5) + 1] as [number, number, number]),
  minValue: 1,
  maxValue: 4,
}

const PLOT_WIDTH = 560

function buildOption() {
  return buildHeatmapOption(heatmap, 'test_hist', {
    timeRange: [times[0], times[times.length - 1] + STEP_SECONDS],
    plotWidthPx: PLOT_WIDTH,
  })
}

/** Mount the option through an ECharts SSR chart and read back visible x-axis labels. */
function mount(option: unknown, width = 640, height = 320) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height } as never)
  chart.setOption(option as never)
  return chart
}

function xAxisLabels(chart: echarts.ECharts): Array<{ tick: number; label: string; px: number }> {
  const model = chart as unknown as { getModel(): { getComponent(n: string, i: number) } }
  const axis = (model.getModel().getComponent('xAxis', 0) as { axis: unknown }).axis as {
    dataToCoord(v: number): number
    getViewLabels(): Array<{ tickValue: number; formattedLabel: string }>
  }
  return axis
    .getViewLabels()
    .map((l) => ({
      tick: l.tickValue,
      label: l.formattedLabel,
      px: Math.round(axis.dataToCoord(l.tickValue)),
    }))
    .filter((l) => l.label !== '')
}

function readTickMeta(option: ReturnType<typeof buildOption>) {
  const xAxis = (Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis) as unknown as {
    data: number[]
    rawChartTimeTicks: RawChartCategoryTimeTicks
  }
  return xAxis.rawChartTimeTicks
}

describe('heatmap x-axis pan preview (Grafana drag rules on a category axis)', () => {
  it('renders static labels at rest', () => {
    const chart = mount(buildOption())
    const restLabels = xAxisLabels(chart)
    expect(restLabels.length).toBeGreaterThan(2)
    expect(restLabels.every((l) => l.label !== '')).toBe(true)
    chart.dispose()
  })

  it('completes the exposed edge with phase-grid ticks while panning, times stay absolute', () => {
    const option = buildOption()
    const meta = readTickMeta(option)
    const bandCount = (option.xAxis as { data: number[] }).data.length
    const chart = mount(option)
    const restLabels = xAxisLabels(chart)

    // Drag right by 11 bands (more than one tick interval) → snapped extent [-11, 29].
    const bands = 11
    const extent = computeCategoryPanExtent(bandCount, (bands * PLOT_WIDTH) / bandCount, PLOT_WIDTH)
    expect(extent).toEqual({ min: -bands, max: bandCount - 1 - bands })
    const labels = buildPanPreviewCategoryLabels((option.xAxis as { data: number[] }).data, extent!, meta)
    expect(labels).not.toBeNull()
    chart.setOption({ xAxis: { min: extent!.min, max: extent!.max, axisLabel: labels! } } as never)
    const panLabels = xAxisLabels(chart)
    console.log('REST:', JSON.stringify(restLabels))
    console.log(`PAN +${bands} bands:`, JSON.stringify(panLabels))

    // The exposed left edge is completed with a continuation tick from the
    // locked phase grid: one interval before the pre-drag window start.
    const leadingEdge = panLabels.find((l) => l.tick < 0)
    expect(leadingEdge).toBeDefined()
    expect(leadingEdge!.tick).toBe(-10)
    const continuationMs = meta.phaseMs - meta.intervalMs
    expect(leadingEdge!.label).toBe(formatTimeAxisLabel(continuationMs, meta.spanMs, meta.intervalMs))

    // Pre-existing labels keep their absolute times and slide right with the cells.
    restLabels.forEach((rest) => {
      const moved = panLabels.find((l) => l.tick === rest.tick)
      if (!moved) {
        return // slid out of the panned viewport together with its band
      }
      expect(moved.label).toBe(rest.label)
      expect(moved.px).toBeGreaterThan(rest.px)
    })
    chart.dispose()
  })

  it('restores the static labels when a drag aborts', () => {
    const option = buildOption()
    const meta = readTickMeta(option)
    const bandCount = (option.xAxis as { data: number[] }).data.length
    const chart = mount(option)
    const restLabels = xAxisLabels(chart)

    const bands = 11
    const extent = computeCategoryPanExtent(bandCount, (bands * PLOT_WIDTH) / bandCount, PLOT_WIDTH)!
    const labels = buildPanPreviewCategoryLabels((option.xAxis as { data: number[] }).data, extent, meta)!
    chart.setOption({ xAxis: { min: extent.min, max: extent.max, axisLabel: labels } } as never)

    // Abort: snap back to the rest extent + static handlers. Compare tick + label
    // only — the plot rect stays locked until the next full option sync.
    chart.setOption({ xAxis: { min: 0, max: bandCount - 1, axisLabel: meta.staticAxisLabel } } as never)
    const restored = xAxisLabels(chart).map(({ tick, label }) => ({ tick, label }))
    expect(restored).toEqual(restLabels.map(({ tick, label }) => ({ tick, label })))
    chart.dispose()
  })

  it('maps ticks onto band ranks and guards degenerate inputs (pure helper)', () => {
    const meta: RawChartCategoryTimeTicks = {
      intervalMs: 120_000,
      phaseMs: 1_000_000_000,
      spanMs: 1_200_000,
      staticAxisLabel: { interval: () => false, formatter: () => '' },
    }
    const bands = Array.from({ length: 10 }, (_, i) => 1_000_000_000 + i * 30_000)
    const labels = buildPanPreviewCategoryLabels(bands, { min: -2, max: 9 }, meta)
    expect(labels).not.toBeNull()
    // Ticks on the phase grid (interval = 4 steps); the window here starts at
    // rank -2, so the first tick inside is rank 0.
    expect(labels!.interval(-4)).toBe(false)
    expect(labels!.interval(0)).toBe(true)
    expect(labels!.interval(4)).toBe(true)
    expect(labels!.interval(1)).toBe(false)
    // formatter receives the extent-relative index (tickValue - extent.min).
    expect(labels!.formatter(undefined, 0 + 2)).not.toBe('')
    expect(labels!.formatter(undefined, 1 + 2)).toBe('')

    expect(buildPanPreviewCategoryLabels([1_000_000_000], { min: 0, max: 0 }, meta)).toBeNull()
    expect(buildPanPreviewCategoryLabels([1_000_000_000, 1_000_000_000], { min: 0, max: 1 }, meta)).toBeNull()
  })
})
