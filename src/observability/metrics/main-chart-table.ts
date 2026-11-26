import type { CachedMainChart } from '@/observability/use-metric-main-chart'
import { promInstantResultToTableRows, type PromInstantTableRow } from './prom-instant-table'

/**
 * Build Query results rows from main-chart cache (no extra PromQL).
 * One table row per unaggregated Prom series (Grafana Query results semantics).
 * Value = last sample in the range window.
 */
export default function mainChartCachedToTableRows(cached: CachedMainChart | null | undefined): PromInstantTableRow[] {
  if (!cached) {
    return []
  }

  if (cached.kind === 'heatmap') {
    return promInstantResultToTableRows(cached.rawSeries ?? [], { fallbackName: cached.name })
  }

  const rawByQuery = cached.rawByQuery ?? []
  const multiQuery = rawByQuery.length > 1
  const rows: PromInstantTableRow[] = []
  rawByQuery.forEach((group) => {
    rows.push(
      ...promInstantResultToTableRows(group.series, {
        legend: multiQuery ? group.legend : undefined,
        fallbackName: cached.name,
      })
    )
  })
  return rows
}
