import { parseJsonFieldChipKey, sqlJsonGetStringExpr } from './logs/json-field-keys'
import { UNKNOWN_LOG_LEVEL, normalizeLogLevelName } from './logs/level-color'
import { buildSeverityLevelsPredicate, isSeverityFilterColumn } from './logs/level-visibility'
import type { DrilldownFilter, DrilldownFilterOp } from './types'

const FILTER_OPS: DrilldownFilterOp[] = ['=', '!=', '=~', '!~']

const INCLUDE_OPS: DrilldownFilterOp[] = ['=', '=~']
const EXCLUDE_OPS: DrilldownFilterOp[] = ['!=', '!~']

export function isDrilldownFilterOp(value: string): value is DrilldownFilterOp {
  return FILTER_OPS.includes(value as DrilldownFilterOp)
}

export function filterKey(filter: DrilldownFilter): string {
  return `${filter.key}\0${filter.op}\0${filter.value}`
}

function escapePromRegexValue(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeSqlLike(value: string): string {
  return escapeSqlString(value).replace(/[%_\\]/g, '\\$&')
}

function sqlContainsPredicate(left: string, values: string[], negate: boolean): string {
  const clauses = values.map((value) => {
    const pattern = `%${escapeSqlLike(value)}%`
    return negate ? `${left} NOT LIKE '${pattern}' ESCAPE '\\'` : `${left} LIKE '${pattern}' ESCAPE '\\'`
  })
  if (clauses.length === 1) {
    return clauses[0]
  }
  return `(${clauses.join(negate ? ' AND ' : ' OR ')})`
}

/** Split a filter value into OR alternatives (`=` single; `=~` / `!~` on `|`). */
export function splitFilterOrValues(filter: DrilldownFilter): string[] {
  if (filter.op === '=~' || filter.op === '!~') {
    return filter.value
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/\\\|/g, '|'))
  }
  const trimmed = filter.value.trim()
  return trimmed ? [trimmed] : []
}

function buildOrFilter(key: string, values: string[], exclude: boolean): DrilldownFilter | null {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (!unique.length) {
    return null
  }
  if (unique.length === 1) {
    return { key, op: exclude ? '!=' : '=', value: unique[0] }
  }
  return {
    key,
    op: exclude ? '!~' : '=~',
    value: unique.map(escapePromRegexValue).join('|'),
  }
}

function isIncludeOp(op: DrilldownFilterOp): boolean {
  return INCLUDE_OPS.includes(op)
}

function isExcludeOp(op: DrilldownFilterOp): boolean {
  return EXCLUDE_OPS.includes(op)
}

/**
 * Append filter with same-key OR merge for include (`=` / `=~`) and exclude (`!=` / `!~`).
 * Different keys remain separate (AND at apply time).
 */
export function addFilter(filters: DrilldownFilter[], filter: DrilldownFilter): DrilldownFilter[] {
  const key = filter.key.trim()
  const value = filter.value.trim()
  if (!key || !value || !isDrilldownFilterOp(filter.op)) {
    return filters
  }

  const nextFilter: DrilldownFilter = { key, op: filter.op, value }
  const exact = filterKey(nextFilter)
  if (filters.some((item) => filterKey(item) === exact)) {
    return filters
  }

  if (isIncludeOp(nextFilter.op)) {
    const existingIndex = filters.findIndex((item) => item.key === key && isIncludeOp(item.op))
    if (existingIndex >= 0) {
      const mergedValues = [...splitFilterOrValues(filters[existingIndex]), ...splitFilterOrValues(nextFilter)]
      const merged = buildOrFilter(key, mergedValues, false)
      if (!merged) {
        return filters
      }
      const next = [...filters]
      next[existingIndex] = merged
      return next
    }
  }

  if (isExcludeOp(nextFilter.op)) {
    const existingIndex = filters.findIndex((item) => item.key === key && isExcludeOp(item.op))
    if (existingIndex >= 0) {
      const mergedValues = [...splitFilterOrValues(filters[existingIndex]), ...splitFilterOrValues(nextFilter)]
      const merged = buildOrFilter(key, mergedValues, true)
      if (!merged) {
        return filters
      }
      const next = [...filters]
      next[existingIndex] = merged
      return next
    }
  }

  return [...filters, nextFilter]
}

export function removeFilter(filters: DrilldownFilter[], index: number): DrilldownFilter[] {
  return filters.filter((_, i) => i !== index)
}

/** Toggle include of a value: add (OR-merge) or remove that value from the same-key include chip. */
export function toggleIncludeFilter(filters: DrilldownFilter[], filter: DrilldownFilter): DrilldownFilter[] {
  const key = filter.key.trim()
  const value = filter.value.trim()
  if (!key || !value) {
    return filters
  }

  const existingIndex = filters.findIndex((item) => item.key === key && isIncludeOp(item.op))
  if (existingIndex < 0) {
    return addFilter(filters, { key, op: '=', value })
  }

  const existing = filters[existingIndex]
  const values = splitFilterOrValues(existing)
  if (!values.includes(value)) {
    return addFilter(filters, { key, op: '=', value })
  }

  const remaining = values.filter((item) => item !== value)
  if (!remaining.length) {
    return removeFilter(filters, existingIndex)
  }
  const merged = buildOrFilter(key, remaining, false)
  if (!merged) {
    return removeFilter(filters, existingIndex)
  }
  const next = [...filters]
  next[existingIndex] = merged
  return next
}

export function filterIncludesValue(filters: DrilldownFilter[], key: string, value: string): boolean {
  const chip = filters.find((item) => item.key === key && isIncludeOp(item.op))
  if (!chip) {
    return false
  }
  return splitFilterOrValues(chip).includes(value)
}

export function formatFilterChip(filter: DrilldownFilter): string {
  return `${filter.key}${filter.op}"${filter.value}"`
}

export type PromMatcherPart = {
  key: string
  op: '=' | '!=' | '=~' | '!~'
  value: string
}

/**
 * Prom matchers from filters. Same-key include values already merged to `=` / `=~`.
 * `__name__` chip is skipped (catalog-only); optional metric override adds `__name__=`.
 */
export function filtersToPromMatcherParts(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): PromMatcherPart[] {
  const parts: PromMatcherPart[] = []

  filters.forEach((filter) => {
    if (filter.key === '__name__' || filter.key === options?.excludeKey) {
      return
    }
    if (!FILTER_OPS.includes(filter.op)) {
      return
    }
    parts.push({ key: filter.key, op: filter.op, value: filter.value })
  })

  if (options?.metric && !parts.some((part) => part.key === '__name__')) {
    parts.push({ key: '__name__', op: '=', value: options.metric })
  }

  return parts
}

/** @deprecated Prefer filtersToPromMatcherParts / buildPromMatchersString — equality-only map. */
export function filtersForPromMatch(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): Record<string, string> {
  const matchers: Record<string, string> = {}
  filtersToPromMatcherParts(filters, options).forEach((part) => {
    if (part.op === '=' || part.op === '=~') {
      matchers[part.key] = part.value
    }
  })
  return matchers
}

/** PromQL / match[] matcher fragment list: `job=~"a|b"`, `env="prod"`. */
export function buildPromMatchersString(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): string | undefined {
  const parts = filtersToPromMatcherParts(filters, options).map(
    (part) => `${part.key}${part.op}"${escapePromLabelValue(part.value)}"`
  )
  return parts.length ? parts.join(',') : undefined
}

/** Prom match[] selector `{...}` from label filters. */
export function buildPromMatchSelector(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): string | undefined {
  const inner = buildPromMatchersString(filters, options)
  return inner ? `{${inner}}` : undefined
}

/** @deprecated Use filtersForPromMatch / buildPromMatchersString */
export function filtersToPromMatch(filters: DrilldownFilter[]): Record<string, string> {
  return filtersForPromMatch(filters)
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

/**
 * Chip key → logs/traces column via fieldMap only.
 * Unmapped Prom-only labels (e.g. `instance` on a table without that column) are skipped —
 * never fall back to the raw key (that produces invalid SQL).
 */
export function resolveFieldMapColumn(chipKey: string, fieldMap: Record<string, string>): string | undefined {
  const mapped = fieldMap[chipKey.trim()]?.trim()
  return mapped || undefined
}

function sqlPredicateForFilter(
  filter: DrilldownFilter,
  columnOrExpr: string,
  options?: { isExpr?: boolean }
): string | undefined {
  const values = splitFilterOrValues(filter)
  if (!values.length) {
    return undefined
  }

  const left = options?.isExpr ? columnOrExpr : `"${columnOrExpr}"`

  if (filter.op === '=') {
    if (values.length === 1) {
      return `${left} = '${escapeSqlString(values[0])}'`
    }
    const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
    return `${left} IN (${list})`
  }

  if (filter.op === '=~') {
    // Multi-value include merge → IN; single =~ stays regex.
    if (values.length > 1) {
      const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
      return `${left} IN (${list})`
    }
    return `${left} ~ '${escapeSqlString(values[0])}'`
  }

  if (filter.op === '!=') {
    if (values.length === 1) {
      return `${left} != '${escapeSqlString(values[0])}'`
    }
    const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
    return `${left} NOT IN (${list})`
  }

  if (filter.op === '!~') {
    if (values.length > 1) {
      const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
      return `${left} NOT IN (${list})`
    }
    return `${left} !~ '${escapeSqlString(values[0])}'`
  }

  return undefined
}

/** SQL WHERE fragments from filters that have a fieldMap column or JSON attribute chip. */
export function filtersToSqlWhere(
  filters: DrilldownFilter[],
  fieldMap: Record<string, string>,
  options?: { excludeKey?: string; jsonColumns?: string[] }
): string[] {
  const parts: string[] = []
  const jsonColumns = options?.jsonColumns ?? []

  filters.forEach((filter) => {
    if (filter.key === options?.excludeKey) {
      return
    }

    const jsonChip = parseJsonFieldChipKey(filter.key, jsonColumns)
    if (jsonChip) {
      const expr = sqlJsonGetStringExpr(jsonChip.column, jsonChip.path)
      const jsonPredicate = sqlPredicateForFilter(filter, expr, { isExpr: true })
      if (jsonPredicate) {
        parts.push(jsonPredicate)
      }
      return
    }

    const column = resolveFieldMapColumn(filter.key, fieldMap)
    if (!column) {
      return
    }
    const values = splitFilterOrValues(filter)
    const bodyContains = column === fieldMap.body?.trim() && (filter.op === '=~' || filter.op === '!~')
    const severityUnknown =
      !bodyContains &&
      isSeverityFilterColumn(column, fieldMap) &&
      (filter.op === '=' || filter.op === '=~') &&
      values.some((value) => normalizeLogLevelName(value) === UNKNOWN_LOG_LEVEL)
    let predicate: string | undefined
    if (bodyContains) {
      predicate = sqlContainsPredicate(`"${column}"`, values, filter.op === '!~')
    } else if (severityUnknown) {
      predicate = buildSeverityLevelsPredicate(column, values)
    } else {
      predicate = sqlPredicateForFilter(filter, column)
    }
    if (predicate) {
      parts.push(predicate)
    }
  })

  return parts
}

/** True when a logs table is bound and at least one filter maps via logs fieldMap. */
export function hasLogsMappedFilters(
  filters: DrilldownFilter[],
  logsFieldMap: Record<string, string>,
  logsTable?: string | null
): boolean {
  if (!logsTable) {
    return false
  }
  return filtersToSqlWhere(filters, logsFieldMap).length > 0
}

export function normalizeCommittedFilters(rows: DrilldownFilter[]): DrilldownFilter[] {
  let result: DrilldownFilter[] = []
  rows.forEach((row) => {
    const key = row.key.trim()
    const value = row.value.trim()
    if (!key || !value || !isDrilldownFilterOp(row.op)) {
      return
    }
    result = addFilter(result, { key, op: row.op, value })
  })
  return result
}
