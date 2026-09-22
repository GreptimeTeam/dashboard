import { inferMetricKind } from '../semantics/heuristics'
import type { MetricKind, MetricTemporality } from '../semantics/types'

/** Histogram kinds with no classic `_bucket` + `le` matrix to build a panel from. */
export function isUnsupportedHistogramKind(kind: MetricKind): boolean {
  return kind === 'native_histogram' || kind === 'gauge_histogram'
}

export type MetricPanelType = 'timeseries' | 'heatmap'

const RATE_WINDOW = '5m'

export interface InferPromQLOptions {
  kind?: MetricKind
  temporality?: MetricTemporality | null
}

function escapePromMetric(metric: string): string {
  return metric.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Whether PromQL should wrap the series in `rate()`.
 * Delta instruments already represent interval increments — skip rate.
 */
export function shouldApplyRate(kind: MetricKind, temporality?: MetricTemporality | null): boolean {
  if (kind !== 'counter' && kind !== 'histogram') {
    return false
  }
  if (temporality === 'delta') {
    return false
  }
  return true
}

export function inferPanelType(name: string, kind?: MetricKind): MetricPanelType {
  const resolved = kind ?? inferMetricKind(name)
  return resolved === 'histogram' ? 'heatmap' : 'timeseries'
}

function histogramMetricName(name: string): string {
  if (name.endsWith('_bucket')) {
    return name
  }
  return `${name}_bucket`
}

export function inferPromQL(metric: string, matchers?: string, options?: InferPromQLOptions | MetricKind): string {
  const opts: InferPromQLOptions = typeof options === 'string' || options === undefined ? { kind: options } : options
  const escaped = escapePromMetric(metric)
  const selector = matchers?.trim() ? `{${matchers}}` : ''
  const resolved = opts.kind ?? inferMetricKind(metric)
  const useRate = shouldApplyRate(resolved, opts.temporality)

  switch (resolved) {
    case 'counter':
      return useRate ? `sum(rate(${escaped}${selector}[${RATE_WINDOW}]))` : `sum(${escaped}${selector})`
    case 'histogram': {
      const bucketName = escapePromMetric(histogramMetricName(metric))
      return useRate
        ? `sum(rate(${bucketName}${selector}[${RATE_WINDOW}])) by (le)`
        : `sum(${bucketName}${selector}) by (le)`
    }
    // Defensive: unsupported histogram kinds are never charted, so no query is built.
    case 'native_histogram':
    case 'gauge_histogram':
      return ''
    case 'summary':
    case 'gauge':
    case 'updown_counter':
    case 'unknown':
    default:
      return `avg(${escaped}${selector})`
  }
}

/** Grafana-style legend label (e.g. `sum(rate)`, `avg`). */
export function inferPromQLLegendLabel(metric: string, options?: InferPromQLOptions | MetricKind): string {
  const opts: InferPromQLOptions = typeof options === 'string' || options === undefined ? { kind: options } : options
  const resolved = opts.kind ?? inferMetricKind(metric)
  const useRate = shouldApplyRate(resolved, opts.temporality)
  switch (resolved) {
    case 'counter':
    case 'histogram':
      return useRate ? 'sum(rate)' : 'sum'
    case 'native_histogram':
    case 'gauge_histogram':
      return ''
    case 'summary':
    case 'gauge':
    case 'updown_counter':
    case 'unknown':
    default:
      return 'avg'
  }
}
