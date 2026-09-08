import type { MetricKind } from './infer-promql'
import { formatMetricUnitValue, resolveMetricPanelUnit } from './metric-units'

export interface SparklineStats {
  last: number | null
  min: number | null
  max: number | null
  mean: number | null
  changePercent: number | null
}

export const METRIC_PANEL_HEIGHT = 220
export const METRIC_PANEL_CHART_HEIGHT = 168

/** Grafana Metrics Drilldown `PANEL_HEIGHT.XL` — detail main graph. */
export const MAIN_CHART_HEIGHT = 280

/** Fallback plot width before ResizeObserver (full-bleed drawer). */
export const MAIN_CHART_FALLBACK_PLOT_WIDTH_PX = 960

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

/**
 * Whether the catalog query wraps the metric in `rate()` (counter → `sum(rate(...))`).
 * Matches Grafana `getTimeseriesQueryRunnerParams` `isRateQuery`.
 */
export function isMetricRateQuery(kind: MetricKind): boolean {
  return kind === 'counter'
}

/** @deprecated Prefer resolveMetricPanelUnit(metricName, isRate). Kept for call sites without a name. */
export function metricKindAxisUnit(kind: MetricKind): string {
  return isMetricRateQuery(kind) ? 'c/s' : ''
}

/** Compact numeric label for panel stats / tables (no metric unit). */
export function formatMetricPanelValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return formatMetricUnitValue(value, 'none')
}

/**
 * Y-axis / tooltip formatter.
 *
 * Grafana timeseries:
 *   unit = isRateQuery ? getPerSecondRateUnit(name) : getUnit(name)
 * e.g. counter → `cps` (`0.3 c/s`), `*_bytes_total` → `Bps`, gauge `*_seconds` → `s`.
 */
export function formatMetricAxisValue(
  value: number | null | undefined,
  options?: { kind?: MetricKind; metricName?: string; forAxis?: boolean }
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const kind = options?.kind ?? 'unknown'
  const isRate = isMetricRateQuery(kind)
  let unit = isRate ? 'cps' : 'none'
  if (options?.metricName) {
    unit = resolveMetricPanelUnit(options.metricName, isRate)
  }
  return formatMetricUnitValue(value, unit)
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
