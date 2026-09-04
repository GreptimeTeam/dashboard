import type { MetricKind } from './infer-promql'

export interface SparklineStats {
  last: number | null
  min: number | null
  max: number | null
  mean: number | null
  changePercent: number | null
}

export const METRIC_PANEL_HEIGHT = 220
export const METRIC_PANEL_CHART_HEIGHT = 168

export function computeSparklineStats(points: Array<[number, number | null]>): SparklineStats {
  const values = points.map(([, value]) => value).filter((value): value is number => value !== null)

  if (!values.length) {
    return {
      last: null,
      min: null,
      max: null,
      mean: null,
      changePercent: null,
    }
  }

  const last = values[values.length - 1]
  const first = values[0]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  let changePercent: number | null = null

  if (first !== 0 && Number.isFinite(first) && Number.isFinite(last)) {
    changePercent = ((last - first) / Math.abs(first)) * 100
  }

  return {
    last,
    min,
    max,
    mean,
    changePercent,
  }
}

export function metricKindAxisUnit(kind: MetricKind): string {
  switch (kind) {
    case 'counter':
      return '/s'
    default:
      return ''
  }
}

function trimCompactSuffix(label: string): string {
  return label.replace(/(\.\d*?)0+([kM])$/, '$1$2').replace(/\.([kM])$/, '$1')
}

function formatCompactNumber(value: number, options?: { forAxis?: boolean }): string {
  const abs = Math.abs(value)
  if (abs === 0) {
    return '0'
  }
  if (abs >= 1_000_000) {
    return trimCompactSuffix(`${(value / 1_000_000).toPrecision(3)}M`)
  }
  if (abs >= 1_000) {
    return trimCompactSuffix(`${(value / 1_000).toPrecision(3)}k`)
  }
  if (abs >= 1) {
    if (Number.isInteger(value)) {
      return options?.forAxis ? String(value) : value.toLocaleString()
    }
    return String(Number(value.toPrecision(4)))
  }
  return value.toExponential(2)
}

/** Compact numeric label for panel stats / tables (no metric-kind unit). */
export function formatMetricPanelValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return formatCompactNumber(value)
}

/** Y-axis / tooltip formatter: compact number + kind unit (e.g. counter → `/s`). */
export function formatMetricAxisValue(
  value: number | null | undefined,
  options?: { kind?: MetricKind; forAxis?: boolean }
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const kind = options?.kind ?? 'unknown'
  const formatted = formatCompactNumber(value, { forAxis: options?.forAxis })
  const unit = metricKindAxisUnit(kind)
  return unit ? `${formatted}${unit}` : formatted
}

export function metricKindLabelKey(kind: MetricKind): string {
  switch (kind) {
    case 'counter':
      return 'drilldown.main.metricKindCounter'
    case 'histogram':
      return 'drilldown.main.metricKindHistogram'
    case 'summary':
      return 'drilldown.main.metricKindSummary'
    case 'updown_counter':
      return 'drilldown.main.metricKindUpdown'
    default:
      return 'drilldown.main.metricKindGauge'
  }
}
