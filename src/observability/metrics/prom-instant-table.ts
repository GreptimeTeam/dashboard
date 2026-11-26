export interface PromInstantLabel {
  key: string
  value: string
}

export interface PromInstantTableRow {
  series: string
  metricName: string
  labels: PromInstantLabel[]
  values: string
  /** Optional legend from multi-query plans (avg / sum / p99…). */
  legend?: string
}

/** Instant vector (`value`) or range matrix (`values`) sample series. */
export interface PromTableSeries {
  metric?: Record<string, string>
  value?: [number, string | number] | Array<[number, string | number]>
  values?: Array<[number, string | number]>
}

function formatSeriesName(metricName: string, labels: PromInstantLabel[]): string {
  if (!labels.length) {
    return metricName
  }
  const labelStr = labels.map((label) => `${label.key}="${label.value}"`).join(', ')
  return `${metricName}{${labelStr}}`
}

function formatSamplePoint(point: [number, string | number]): string {
  return String(point[1])
}

/**
 * Instant: `value` pair → sample string.
 * Range matrix: last point in `values` (aligns table with main-chart range data).
 */
function formatSeriesValue(series: PromTableSeries): string | undefined {
  if (series.value !== undefined) {
    const { value } = series
    if (Array.isArray(value) && value.length === 2 && !Array.isArray(value[0])) {
      return formatSamplePoint(value as [number, string | number])
    }
    if (Array.isArray(value) && Array.isArray(value[0])) {
      return (value as Array<[number, string | number]>).map((point) => `${point[0]} @${point[1]}`).join('\n')
    }
  }

  if (Array.isArray(series.values) && series.values.length > 0) {
    const last = series.values[series.values.length - 1]
    if (Array.isArray(last) && last.length >= 2) {
      return formatSamplePoint(last as [number, string | number])
    }
  }

  return undefined
}

/**
 * Map PromQL instant vector or range matrix `result` to DataTable Series/Values rows.
 */
export function promInstantResultToTableRows(
  result: PromTableSeries[] | null | undefined,
  options?: { legend?: string; fallbackName?: string }
): PromInstantTableRow[] {
  if (!result?.length) {
    return []
  }

  const legend = options?.legend?.trim()
  const fallbackName = options?.fallbackName?.trim()
  const rows: PromInstantTableRow[] = []

  result.forEach((series) => {
    const metricName = series.metric?.__name__ ?? ''
    const seriesLabels = { ...series.metric }
    delete seriesLabels.__name__

    const labels = Object.entries(seriesLabels).map(([key, value]) => ({
      key,
      value: String(value),
    }))

    const values = formatSeriesValue(series)
    if (values === undefined) {
      return
    }

    const displayName = metricName || fallbackName || legend || 'series'
    const seriesName = formatSeriesName(displayName, labels)
    rows.push({
      series: legend ? `${legend}: ${seriesName}` : seriesName,
      metricName: displayName,
      labels,
      values,
      legend,
    })
  })

  return rows
}
