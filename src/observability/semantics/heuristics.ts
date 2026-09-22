import type { MetricKind } from './types'

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

/** Metric kind guessed from the Prometheus naming convention. */
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
