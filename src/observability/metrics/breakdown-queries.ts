import type { MetricKind, MetricTemporality } from './infer-promql'
import { inferMetricKind, shouldApplyRate } from './infer-promql'
import type { TimeseriesAgg } from './main-chart-config'

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

function innerExpr(
  metric: string,
  matchers: string | undefined,
  kind: MetricKind,
  temporality?: MetricTemporality | null
): string {
  const escaped = escapePromMetric(metric)
  const selector = selectorSuffix(matchers)
  const useRate = shouldApplyRate(kind, temporality)

  if (kind === 'histogram') {
    const sumName = escapePromMetric(histogramSumMetricName(metric))
    return useRate ? withRate(sumName, selector) : `${sumName}${selector}`
  }

  if (kind === 'counter') {
    return useRate ? withRate(escaped, selector) : `${escaped}${selector}`
  }

  return `${escaped}${selector}`
}

export interface BreakdownQueryOptions {
  kind?: MetricKind
  temporality?: MetricTemporality | null
  /** Main-chart Configure agg; histogram volume path always uses sum. */
  agg?: TimeseriesAgg
}

/** Resolve effective outer agg for breakdown (follows Configure; hist stays sum). */
export function resolveBreakdownAgg(kind: MetricKind, agg?: TimeseriesAgg): TimeseriesAgg {
  if (kind === 'histogram') {
    return 'sum'
  }
  if (agg === 'avg' || agg === 'sum' || agg === 'min_max') {
    return agg
  }
  return kind === 'counter' ? 'sum' : 'avg'
}

/**
 * Group-by panels cannot sensibly render min+max per label value;
 * fall back to avg (gauge) / sum (counter) defaults via resolveBreakdownAgg then map min_max → avg.
 */
function groupByAgg(kind: MetricKind, agg?: TimeseriesAgg): 'avg' | 'sum' {
  const resolved = resolveBreakdownAgg(kind, agg)
  if (resolved === 'sum') {
    return 'sum'
  }
  return 'avg'
}

function rateLegendSuffix(kind: MetricKind, temporality?: MetricTemporality | null): string {
  return shouldApplyRate(kind, temporality) ? '(rate)' : ''
}

export function breakdownLegendForAgg(
  kind: MetricKind,
  agg: 'avg' | 'sum' | 'min' | 'max',
  temporality?: MetricTemporality | null
): string {
  const suffix = rateLegendSuffix(kind, temporality)
  if (agg === 'sum') {
    return suffix ? 'sum(rate)' : 'sum'
  }
  if (agg === 'min') {
    return suffix ? `min${suffix}` : 'min'
  }
  if (agg === 'max') {
    return suffix ? `max${suffix}` : 'max'
  }
  return suffix ? `avg${suffix}` : 'avg'
}

function wrapAgg(inner: string, agg: 'avg' | 'sum' | 'min' | 'max', groupByLabel?: string): string {
  const byClause = groupByLabel?.trim() ? ` by (${groupByLabel.trim()})` : ''
  return `${agg}(${inner})${byClause}`
}

/**
 * Label-overview Breakdown: one multi-series query grouped by label.
 * Uses Configure agg (avg/sum); min_max → avg for group-by.
 */
export function buildBreakdownGroupByExpr(
  metric: string,
  labelKey: string,
  matchers?: string,
  kindOrOptions?: MetricKind | BreakdownQueryOptions
): string {
  const options: BreakdownQueryOptions =
    typeof kindOrOptions === 'string' || kindOrOptions === undefined ? { kind: kindOrOptions } : kindOrOptions
  const resolved = options.kind ?? inferMetricKind(metric)
  const inner = innerExpr(metric, matchers, resolved, options.temporality)
  const agg = groupByAgg(resolved, options.agg)
  return wrapAgg(inner, agg, labelKey)
}

export interface BreakdownValueQuery {
  expr: string
  legend: string
}

/**
 * Value-card Breakdown: filtered query(ies) for `label="value"`.
 * min_max → min + max dual series (same as main Configure).
 */
export function buildBreakdownValueExprs(
  metric: string,
  labelKey: string,
  value: string,
  matchers?: string,
  kindOrOptions?: MetricKind | BreakdownQueryOptions
): BreakdownValueQuery[] {
  const options: BreakdownQueryOptions =
    typeof kindOrOptions === 'string' || kindOrOptions === undefined ? { kind: kindOrOptions } : kindOrOptions
  const resolved = options.kind ?? inferMetricKind(metric)
  const valueMatcher = `${labelKey.trim()}="${escapePromLabelValue(value)}"`
  const merged = mergeMatchers(matchers, valueMatcher)
  const inner = innerExpr(metric, merged, resolved, options.temporality)
  const agg = resolveBreakdownAgg(resolved, options.agg)

  if (agg === 'min_max') {
    return [
      {
        expr: wrapAgg(inner, 'min'),
        legend: breakdownLegendForAgg(resolved, 'min', options.temporality),
      },
      {
        expr: wrapAgg(inner, 'max'),
        legend: breakdownLegendForAgg(resolved, 'max', options.temporality),
      },
    ]
  }

  return [
    {
      expr: wrapAgg(inner, agg),
      legend: breakdownLegendForAgg(resolved, agg, options.temporality),
    },
  ]
}

/** @deprecated Prefer buildBreakdownValueExprs (supports min_max). */
export function buildBreakdownValueExpr(
  metric: string,
  labelKey: string,
  value: string,
  matchers?: string,
  kindOrOptions?: MetricKind | BreakdownQueryOptions
): string {
  return buildBreakdownValueExprs(metric, labelKey, value, matchers, kindOrOptions)[0]?.expr ?? ''
}

export default buildBreakdownGroupByExpr
