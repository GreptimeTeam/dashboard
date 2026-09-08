import type { DrilldownFilter, DrilldownFilterOp } from './types'

const FILTER_OPS: DrilldownFilterOp[] = ['=', '!=', '=~', '!~']

export function isDrilldownFilterOp(value: string): value is DrilldownFilterOp {
  return FILTER_OPS.includes(value as DrilldownFilterOp)
}

export function filterKey(filter: DrilldownFilter): string {
  return `${filter.key}\0${filter.op}\0${filter.value}`
}

export function addFilter(filters: DrilldownFilter[], filter: DrilldownFilter): DrilldownFilter[] {
  const key = filterKey(filter)
  if (filters.some((item) => filterKey(item) === key)) {
    return filters
  }
  return [...filters, filter]
}

export function removeFilter(filters: DrilldownFilter[], index: number): DrilldownFilter[] {
  return filters.filter((_, i) => i !== index)
}

export function formatFilterChip(filter: DrilldownFilter): string {
  return `${filter.key}${filter.op}"${filter.value}"`
}

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Equality filters usable in Prom API match[] selectors. */
export function filtersForPromMatch(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): Record<string, string> {
  const matchers: Record<string, string> = {}

  filters.forEach((filter) => {
    if (filter.key === '__name__' || filter.key === options?.excludeKey) {
      return
    }
    if (filter.op !== '=') {
      return
    }
    matchers[filter.key] = filter.value
  })

  if (options?.metric && !matchers.__name__) {
    matchers.__name__ = options.metric
  }

  return matchers
}

/** Prom match[] selector fragments from label filters (__name__ excluded unless metric override). */
export function filtersToPromMatch(filters: DrilldownFilter[]): Record<string, string> {
  return filtersForPromMatch(filters)
}

export function buildPromMatchSelector(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): string | undefined {
  const matchers = filtersForPromMatch(filters, options)
  const parts = Object.entries(matchers).map(([key, value]) => `${key}="${escapePromLabelValue(value)}"`)
  if (!parts.length) {
    return undefined
  }
  return `{${parts.join(',')}}`
}

/** Greptime requires `__name__` in Prom API `match[]`; selectors without it must not be sent. */
export function isGreptimePromMatchSelector(selector: string | undefined): boolean {
  return Boolean(selector?.includes('__name__='))
}

export const DRILLDOWN_FILTER_OP_OPTIONS: Array<{ label: string; value: DrilldownFilterOp }> = [
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '=~', value: '=~' },
  { label: '!~', value: '!~' },
]

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

/** SQL WHERE fragments from equality filters (chip key → column via fieldMap). */
export function filtersToSqlWhere(
  filters: DrilldownFilter[],
  fieldMap: Record<string, string>,
  options?: { excludeKey?: string }
): string[] {
  const parts: string[] = []

  filters.forEach((filter) => {
    if (filter.key === options?.excludeKey || filter.op !== '=') {
      return
    }
    const column = fieldMap[filter.key] ?? filter.key
    parts.push(`"${column}" = '${escapeSqlString(filter.value)}'`)
  })

  return parts
}

export function normalizeCommittedFilters(rows: DrilldownFilter[]): DrilldownFilter[] {
  const seen = new Set<string>()
  const result: DrilldownFilter[] = []

  rows.forEach((row) => {
    const key = row.key.trim()
    const value = row.value.trim()
    if (!key || !value || !isDrilldownFilterOp(row.op)) {
      return
    }
    const filter: DrilldownFilter = { key, op: row.op, value }
    const dedupeKey = filterKey(filter)
    if (seen.has(dedupeKey)) {
      return
    }
    seen.add(dedupeKey)
    result.push(filter)
  })

  return result
}
