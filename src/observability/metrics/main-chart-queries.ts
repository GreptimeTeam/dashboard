import { inferMetricKind, isHistogramMetricName } from './infer-promql'
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

/**
 * Build main-chart PromQL from Configure / variant prefs.
 * Still name-heuristic (no table_semantics) — same family as `inferPromQL`.
 */
export default function buildMainChartQueries(
  metric: string,
  matchers: string | undefined,
  prefs: ResolvedMainChartPrefs
): MainChartQueryPlan {
  const kind = inferMetricKind(metric)
  const escaped = escapePromMetric(metric)
  const selector = selectorSuffix(matchers)

  if (kind === 'histogram' || isHistogramMetricName(metric)) {
    const bucket = escapePromMetric(histogramBucketName(metric))
    const rateByLe = `sum(${withRate(bucket, selector)}) by (le)`

    if (prefs.variant === 'percentiles') {
      return {
        panel: 'timeseries',
        queries: prefs.percentiles.map((p) => ({
          expr: `histogram_quantile(${(p / 100).toFixed(2)}, ${rateByLe})`,
          legend: `p${p}`,
        })),
      }
    }

    return {
      panel: 'heatmap',
      queries: [{ expr: rateByLe, legend: 'sum(rate)' }],
    }
  }

  const isCounter = kind === 'counter'
  const inner = isCounter ? withRate(escaped, selector) : `${escaped}${selector}`

  if (prefs.agg === 'min_max') {
    return {
      panel: 'timeseries',
      queries: [
        { expr: `min(${inner})`, legend: isCounter ? 'min(rate)' : 'min' },
        { expr: `max(${inner})`, legend: isCounter ? 'max(rate)' : 'max' },
      ],
    }
  }

  if (prefs.agg === 'sum') {
    return {
      panel: 'timeseries',
      queries: [
        {
          expr: isCounter ? `sum(${inner})` : `sum(${escaped}${selector})`,
          legend: isCounter ? 'sum(rate)' : 'sum',
        },
      ],
    }
  }

  // avg (default for gauge / unknown / summary)
  return {
    panel: 'timeseries',
    queries: [
      {
        expr: isCounter ? `avg(${inner})` : `avg(${escaped}${selector})`,
        legend: isCounter ? 'avg(rate)' : 'avg',
      },
    ],
  }
}
