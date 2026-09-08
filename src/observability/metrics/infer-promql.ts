export type MetricKind = 'counter' | 'gauge' | 'updown_counter' | 'histogram' | 'summary' | 'unknown'

export type MetricPanelType = 'timeseries' | 'heatmap'

/** Mirrors Greptime `metric.temporality` (declared). */
export type MetricTemporality = 'cumulative' | 'delta' | 'mixed' | 'unknown' | string

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

/** Classic Prometheus histogram: base name, _bucket, or duration *_seconds family. */
export function isHistogramMetricName(name: string): boolean {
  if (name.endsWith('_bucket')) {
    return true
  }
  if (name.endsWith('_seconds_sum') || name.endsWith('_seconds_count')) {
    return false
  }
  if (name.endsWith('_seconds')) {
    return true
  }
  return false
}

export function inferMetricKind(name: string): MetricKind {
  if (isHistogramMetricName(name)) {
    return 'histogram'
  }
  if (name.endsWith('_total') || name.endsWith('_count')) {
    return 'counter'
  }
  if (name.includes('quantile')) {
    return 'summary'
  }
  return 'unknown'
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
    case 'summary':
    case 'gauge':
    case 'updown_counter':
    case 'unknown':
    default:
      return 'avg'
  }
}
