import type { LocationQueryRaw } from 'vue-router'

export interface MetricsQueryDeepLinkInput {
  /** Primary PromQL (first query). Metrics-query editor is single-query. */
  promql: string
  /** Relative minutes; 0 means use absolute rangeTime. */
  timeLength: number
  /** Absolute range as unix-second strings when timeLength === 0. */
  rangeTime?: string[]
}

/**
 * Build router location for Metrics Explore (`/dashboard/metrics-query`).
 * Filters must already be baked into `promql` (metrics-query has no filter params).
 */
export function buildMetricsQueryLocation(input: MetricsQueryDeepLinkInput): {
  name: string
  query: LocationQueryRaw
} {
  const query: LocationQueryRaw = {
    promql: encodeURIComponent(input.promql),
    tab: 'graph',
  }

  if (input.timeLength > 0) {
    query.timeLength = String(input.timeLength)
  } else if (input.rangeTime?.length === 2) {
    query.timeRange = input.rangeTime
  }

  return {
    name: 'metrics',
    query,
  }
}
