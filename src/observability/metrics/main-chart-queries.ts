import {
  inferMetricKind,
  isHistogramMetricName,
  shouldApplyRate,
  type MetricKind,
  type MetricTemporality,
} from './infer-promql'
import type { ResolvedMainChartPrefs } from './main-chart-config'

const RATE_WINDOW = '5m'

export interface MainChartQuery {
  expr: string
  legend: string
}

export interface MainChartQueryPlan {
  /** Heatmap uses classic le matrix; otherwise timeseries (incl. percentiles). */
  panel: 'timeseries' | 'heatmap'
  queries: MainChartQuery[]
}

function escapePromMetric(metric: string): string {
  return metric.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function selectorSuffix(matchers?: string): string {
  return matchers?.trim() ? `{${matchers}}` : ''
}

function histogramBucketName(metric: string): string {
  if (metric.endsWith('_bucket')) {
    return metric
  }
  return `${metric}_bucket`
}

function withRate(escapedMetric: string, selector: string): string {
  return `rate(${escapedMetric}${selector}[${RATE_WINDOW}])`
}

function counterInner(escaped: string, selector: string, useRate: boolean): string {
  return useRate ? withRate(escaped, selector) : `${escaped}${selector}`
}

/**
 * Build main-chart PromQL from Configure / variant prefs.
 * Pass resolved `kind` / `temporality` from `resolveMetricMeta` when available.
 */
export default function buildMainChartQueries(
  metric: string,
  matchers: string | undefined,
  prefs: ResolvedMainChartPrefs,
  kind?: MetricKind,
  temporality?: MetricTemporality | null
): MainChartQueryPlan {
  const resolvedKind = kind ?? inferMetricKind(metric)
  const escaped = escapePromMetric(metric)
  const selector = selectorSuffix(matchers)
  const useRate = shouldApplyRate(resolvedKind, temporality)

  if (resolvedKind === 'histogram' || isHistogramMetricName(metric)) {
    const bucket = escapePromMetric(histogramBucketName(metric))
    const byLe = useRate ? `sum(${withRate(bucket, selector)}) by (le)` : `sum(${bucket}${selector}) by (le)`
    const histLegend = useRate ? 'sum(rate)' : 'sum'

    if (prefs.variant === 'percentiles') {
      return {
        panel: 'timeseries',
        queries: prefs.percentiles.map((p) => ({
          expr: `histogram_quantile(${(p / 100).toFixed(2)}, ${byLe})`,
          legend: `p${p}`,
        })),
      }
    }

    return {
      panel: 'heatmap',
      queries: [{ expr: byLe, legend: histLegend }],
    }
  }

  const isCounter = resolvedKind === 'counter'
  const inner = isCounter ? counterInner(escaped, selector, useRate) : `${escaped}${selector}`
  const rateSuffix = isCounter && useRate ? '(rate)' : ''

  if (prefs.agg === 'min_max') {
    return {
      panel: 'timeseries',
      queries: [
        { expr: `min(${inner})`, legend: isCounter ? `min${rateSuffix}` : 'min' },
        { expr: `max(${inner})`, legend: isCounter ? `max${rateSuffix}` : 'max' },
      ],
    }
  }

  if (prefs.agg === 'sum') {
    let sumLegend = 'sum'
    if (isCounter && useRate) {
      sumLegend = 'sum(rate)'
    }
    return {
      panel: 'timeseries',
      queries: [
        {
          expr: isCounter ? `sum(${inner})` : `sum(${escaped}${selector})`,
          legend: sumLegend,
        },
      ],
    }
  }

  // avg (default for gauge / unknown / summary)
  let avgLegend = 'avg'
  if (isCounter && useRate) {
    avgLegend = 'avg(rate)'
  }
  return {
    panel: 'timeseries',
    queries: [
      {
        expr: isCounter ? `avg(${inner})` : `avg(${escaped}${selector})`,
        legend: avgLegend,
      },
    ],
  }
}
