export type MetricKind = 'counter' | 'gauge' | 'updown_counter' | 'histogram' | 'summary' | 'unknown'

export type MetricPanelType = 'timeseries' | 'heatmap'

const RATE_WINDOW = '5m'

function escapePromMetric(metric: string): string {
  return metric.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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

export function inferPanelType(name: string): MetricPanelType {
  return inferMetricKind(name) === 'histogram' ? 'heatmap' : 'timeseries'
}

function histogramMetricName(name: string): string {
  if (name.endsWith('_bucket')) {
    return name
  }
  return `${name}_bucket`
}

export function inferPromQL(metric: string, matchers?: string): string {
  const escaped = escapePromMetric(metric)
  const selector = matchers?.trim() ? `{${matchers}}` : ''
  const kind = inferMetricKind(metric)

  switch (kind) {
    case 'counter':
      return `sum(rate(${escaped}${selector}[${RATE_WINDOW}]))`
    case 'histogram': {
      const bucketName = escapePromMetric(histogramMetricName(metric))
      return `sum(rate(${bucketName}${selector}[${RATE_WINDOW}])) by (le)`
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
export function inferPromQLLegendLabel(metric: string): string {
  const kind = inferMetricKind(metric)
  switch (kind) {
    case 'counter':
    case 'histogram':
      return 'sum(rate)'
    case 'summary':
    case 'gauge':
    case 'updown_counter':
    case 'unknown':
    default:
      return 'avg'
  }
}
