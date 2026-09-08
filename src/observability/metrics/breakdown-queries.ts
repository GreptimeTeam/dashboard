import type { MetricKind } from './infer-promql'
import { inferMetricKind } from './infer-promql'

const RATE_WINDOW = '5m'

function escapePromMetric(metric: string): string {
  return metric.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function selectorSuffix(matchers?: string): string {
  return matchers?.trim() ? `{${matchers}}` : ''
}

function mergeMatchers(base: string | undefined, extra: string): string {
  const parts = [base?.trim(), extra.trim()].filter(Boolean)
  return parts.join(',')
}

/**
 * Classic histogram sum series for Breakdown volume (Grafana hist sum path).
 * `_bucket` → `_sum`; otherwise append `_sum`.
 */
export function histogramSumMetricName(name: string): string {
  if (name.endsWith('_bucket')) {
    return `${name.slice(0, -'_bucket'.length)}_sum`
  }
  if (name.endsWith('_sum')) {
    return name
  }
  return `${name}_sum`
}

function withRate(escapedMetric: string, selector: string): string {
  return `rate(${escapedMetric}${selector}[${RATE_WINDOW}])`
}

function innerExpr(metric: string, matchers: string | undefined, kind: MetricKind): string {
  const escaped = escapePromMetric(metric)
  const selector = selectorSuffix(matchers)

  if (kind === 'histogram') {
    const sumName = escapePromMetric(histogramSumMetricName(metric))
    return withRate(sumName, selector)
  }

  if (kind === 'counter') {
    return withRate(escaped, selector)
  }

  return `${escaped}${selector}`
}

function aggregateOuter(inner: string, kind: MetricKind, groupByLabel?: string): string {
  const byClause = groupByLabel?.trim() ? ` by (${groupByLabel.trim()})` : ''
  if (kind === 'counter' || kind === 'histogram') {
    return `sum(${inner})${byClause}`
  }
  return `avg(${inner})${byClause}`
}

/**
 * Label-overview Breakdown: one multi-series query grouped by label.
 * Configure excluded — type defaults only (counter→sum(rate), gauge→avg, hist→sum(_sum rate)).
 */
export function buildBreakdownGroupByExpr(
  metric: string,
  labelKey: string,
  matchers?: string,
  kind?: MetricKind
): string {
  const resolved = kind ?? inferMetricKind(metric)
  const inner = innerExpr(metric, matchers, resolved)
  return aggregateOuter(inner, resolved, labelKey)
}

/**
 * Value-card Breakdown: filtered single-series query (`label="value"`).
 */
export function buildBreakdownValueExpr(
  metric: string,
  labelKey: string,
  value: string,
  matchers?: string,
  kind?: MetricKind
): string {
  const resolved = kind ?? inferMetricKind(metric)
  const valueMatcher = `${labelKey.trim()}="${escapePromLabelValue(value)}"`
  const merged = mergeMatchers(matchers, valueMatcher)
  const inner = innerExpr(metric, merged, resolved)
  return aggregateOuter(inner, resolved)
}

export default buildBreakdownGroupByExpr
