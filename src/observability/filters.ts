import { parseJsonFieldChipKey, sqlJsonGetStringExpr } from './logs/json-field-keys'
import { UNKNOWN_LOG_LEVEL, normalizeLogLevelName } from './logs/level-color'
import { buildSeverityLevelsPredicate, isSeverityFilterColumn } from './logs/level-visibility'
import { normalizeEntityFilters } from './semantics/otlp'
import type { DrilldownFilter, DrilldownFilterOp, DrilldownSignal } from './types'

/** Numeric literal guard; the value is rendered verbatim so bigint precision survives. */
const NUMERIC_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

/** GreptimeDB boolean needs TRUE/FALSE — `= 'true'` fails planning with Boolean = Utf8. */
function booleanLiteral(value: string): 'TRUE' | 'FALSE' | undefined {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') {
    return 'TRUE'
  }
  if (normalized === 'false' || normalized === '0') {
    return 'FALSE'
  }
  return undefined
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

const FILTER_OPS: DrilldownFilterOp[] = ['=', '!=', '=~', '!~', '>', '>=', '<', '<=']

/** Comparison ops need a numeric column; `filterOpsForType` decides what the UI offers. */
const NUMERIC_FILTER_OPS: DrilldownFilterOp[] = ['=', '!=', '>', '>=', '<', '<=']
const STRING_FILTER_OPS: DrilldownFilterOp[] = ['=', '!=', '=~', '!~']
const BOOLEAN_FILTER_OPS: DrilldownFilterOp[] = ['=', '!=']

const INCLUDE_OPS: DrilldownFilterOp[] = ['=', '=~']
const EXCLUDE_OPS: DrilldownFilterOp[] = ['!=', '!~']

type ColumnValueKind = 'string' | 'number' | 'boolean'

/** Physical/logical column type (GreptimeDB `data_type` or schema semantic type) → value kind. */
export function columnValueKind(dataType: string | undefined): ColumnValueKind {
  const type = (dataType || '').toLowerCase()
  if (!type) {
    return 'string'
  }
  if (type.includes('bool')) {
    return 'boolean'
  }
  if (
    type.includes('int') ||
    type.includes('uint') ||
    type.includes('float') ||
    type.includes('double') ||
    type.includes('decimal') ||
    type.includes('number')
  ) {
    return 'number'
  }
  return 'string'
}

/** Operators the combobox offers for a key of `dataType` (unknown types behave like strings). */
export function filterOpsForType(dataType: string | undefined): DrilldownFilterOp[] {
  const kind = columnValueKind(dataType)
  if (kind === 'number') {
    return NUMERIC_FILTER_OPS
  }
  if (kind === 'boolean') {
    return BOOLEAN_FILTER_OPS
  }
  return STRING_FILTER_OPS
}

/** Fall back to `=` when an operator does not apply to the column type (e.g. from a URL). */
export function normalizeFilterOp(dataType: string | undefined, op: DrilldownFilterOp): DrilldownFilterOp {
  return filterOpsForType(dataType).includes(op) ? op : '='
}

/** True when `value` can be rendered for `dataType` — numeric/boolean inputs are validated. */
export function isValidFilterValue(dataType: string | undefined, value: string): boolean {
  const kind = columnValueKind(dataType)
  if (kind === 'number') {
    return NUMERIC_LITERAL.test(value.trim())
  }
  if (kind === 'boolean') {
    return booleanLiteral(value) !== undefined
  }
  return Boolean(value.trim())
}

/**
 * Single SQL literal for `dataType`; undefined when the value cannot be rendered.
 * Numbers stay unquoted (bigint precision preserved), booleans become TRUE/FALSE.
 */
export function sqlValueLiteral(dataType: string | undefined, value: string): string | undefined {
  const kind = columnValueKind(dataType)
  if (kind === 'number') {
    const trimmed = value.trim()
    return NUMERIC_LITERAL.test(trimmed) ? trimmed : undefined
  }
  if (kind === 'boolean') {
    return booleanLiteral(value)
  }
  return `'${escapeSqlString(value)}'`
}

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

/** PromQL label matchers — comparison ops (`>`, `<=`, …) do not exist there. */
export type PromMatcherOp = '=' | '!=' | '=~' | '!~'

function isPromMatcherOp(op: DrilldownFilterOp): op is PromMatcherOp {
  return STRING_FILTER_OPS.includes(op)
}

export type PromMatcherPart = {
  key: string
  op: PromMatcherOp
  value: string
}

/**
 * Prom matchers from filters. Same-key include values already merged to `=` / `=~`.
 * `__name__` chip is skipped (catalog-only); optional metric override adds `__name__=`.
 *
 * Prom matchers are the metrics signal's vocabulary, so entity filters are normalized
 * first: a canonical `service` chip becomes the metric label (`job`), and alias
 * duplicates collapse instead of ANDing two labels.
 */
export function filtersToPromMatcherParts(
  filters: DrilldownFilter[],
  options?: { excludeKey?: string; metric?: string }
): PromMatcherPart[] {
  const parts: PromMatcherPart[] = []

  normalizeEntityFilters(filters, 'metrics').forEach((filter) => {
    if (filter.key === '__name__' || filter.key === options?.excludeKey) {
      return
    }
    if (!isPromMatcherOp(filter.op)) {
      return
    }
    parts.push({ key: filter.key, op: filter.op, value: filter.value })
  })

  if (options?.metric && !parts.some((part) => part.key === '__name__')) {
    parts.push({ key: '__name__', op: '=', value: options.metric })
  }

  return parts
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

/** Greptime requires `__name__` in Prom API `match[]`; selectors without it must not be sent. */
export function isGreptimePromMatchSelector(selector: string | undefined): boolean {
  return Boolean(selector?.includes('__name__='))
}

export const DRILLDOWN_FILTER_OP_OPTIONS: Array<{ label: string; value: DrilldownFilterOp }> = [
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '=~', value: '=~' },
  { label: '!~', value: '!~' },
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
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
  options?: { isExpr?: boolean; dataType?: string }
): string | undefined {
  const values = splitFilterOrValues(filter)
  if (!values.length) {
    return undefined
  }

  const left = options?.isExpr ? columnOrExpr : `"${columnOrExpr}"`
  // JSON chips always read as strings; physical columns carry their own type.
  const kind: ColumnValueKind = options?.isExpr ? 'string' : columnValueKind(options?.dataType)
  const literal = (value: string): string | undefined =>
    options?.isExpr ? `'${escapeSqlString(value)}'` : sqlValueLiteral(options?.dataType, value)

  // Comparison ops need a numeric column and a single value; anything else is dropped
  // rather than emitted as SQL GreptimeDB would reject (e.g. Boolean = Utf8).
  if (filter.op === '>' || filter.op === '>=' || filter.op === '<' || filter.op === '<=') {
    if (kind !== 'number' || values.length !== 1) {
      return undefined
    }
    const right = literal(values[0])
    return right ? `${left} ${filter.op} ${right}` : undefined
  }

  if (filter.op === '=') {
    const list = values.map(literal)
    if (list.some((item) => item === undefined)) {
      return undefined
    }
    if (values.length === 1) {
      return `${left} = ${list[0]}`
    }
    return `${left} IN (${list})`
  }

  if (filter.op === '=~') {
    if (kind !== 'string') {
      return undefined
    }
    // Multi-value include merge → IN; single =~ stays regex.
    if (values.length > 1) {
      const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
      return `${left} IN (${list})`
    }
    return `${left} ~ '${escapeSqlString(values[0])}'`
  }

  if (filter.op === '!=') {
    const list = values.map(literal)
    if (list.some((item) => item === undefined)) {
      return undefined
    }
    if (values.length === 1) {
      return `${left} != ${list[0]}`
    }
    return `${left} NOT IN (${list})`
  }

  if (filter.op === '!~') {
    if (kind !== 'string') {
      return undefined
    }
    if (values.length > 1) {
      const list = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
      return `${left} NOT IN (${list})`
    }
    return `${left} !~ '${escapeSqlString(values[0])}'`
  }

  return undefined
}

/**
 * SQL WHERE fragments from filters that name a real column, a fieldMap column, or a JSON
 * attribute chip.
 *
 * `columns` (the bound table's physical columns) disambiguates dotted keys: trace tables
 * flatten attributes into `resource_attributes.*` / `span_attributes.*` **columns**, so an
 * exact column match must win over the JSON chip reading — that reading would target a
 * container column those tables do not have.
 */
export function filtersToSqlWhere(
  filters: DrilldownFilter[],
  fieldMap: Record<string, string>,
  options?: {
    excludeKey?: string
    jsonColumns?: string[]
    containsColumns?: string[]
    columns?: string[]
    /** Column data types — needed for typed literal rendering (traces attribute columns). */
    typeOf?: (column: string) => string | undefined
  }
): string[] {
  const parts: string[] = []
  const jsonColumns = options?.jsonColumns ?? []

  filters.forEach((filter) => {
    if (filter.key === options?.excludeKey) {
      return
    }

    const physical = options?.columns?.includes(filter.key) ? filter.key : undefined
    if (!physical) {
      const jsonChip = parseJsonFieldChipKey(filter.key, jsonColumns)
      if (jsonChip) {
        const expr = sqlJsonGetStringExpr(jsonChip.column, jsonChip.path)
        const jsonPredicate = sqlPredicateForFilter(filter, expr, { isExpr: true })
        if (jsonPredicate) {
          parts.push(jsonPredicate)
        }
        return
      }
    }

    const column = physical ?? resolveFieldMapColumn(filter.key, fieldMap)
    if (!column) {
      return
    }
    const values = splitFilterOrValues(filter)
    const containsColumns = options?.containsColumns ?? []
    const bodyContains =
      (filter.op === '=~' || filter.op === '!~') &&
      (column === fieldMap.body?.trim() || containsColumns.includes(column) || containsColumns.includes(filter.key))
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
      predicate = sqlPredicateForFilter(filter, column, { dataType: options?.typeOf?.(column) })
    }
    if (predicate) {
      parts.push(predicate)
    }
  })

  return parts
}

/**
 * Whether a shared filter can be applied to `signal`'s bound table.
 *
 * Filters are shared across signals, so a condition set on metrics (e.g. `container_name`)
 * may name a column another signal's table does not have. Such a filter is dropped from that
 * signal's view and queries — but it is *not* removed from the shared state, so switching
 * back to a signal that supports it brings it back.
 *
 * Metrics always pass: labels live per metric table, so there is nothing single to validate
 * against. Logs/traces pass when the key is a column of the bound table, a JSON attribute
 * chip inside one of its containers, or a fieldMap role. Until a table is bound (`columns`
 * unknown) everything passes, so nothing disappears while the table is still resolving.
 */
export function filterAppliesToSignal(
  filter: DrilldownFilter,
  signal: DrilldownSignal,
  options?: { fieldMap?: Record<string, string>; columns?: string[]; jsonColumns?: string[] }
): boolean {
  const key = filter.key.trim()
  if (!key) {
    return false
  }
  if (signal === 'metrics') {
    return true
  }
  const columns = options?.columns
  if (!columns?.length) {
    return true
  }
  if (columns.includes(key)) {
    return true
  }
  const jsonChip = parseJsonFieldChipKey(key, options?.jsonColumns ?? [])
  if (jsonChip && columns.includes(jsonChip.column)) {
    return true
  }
  return Boolean(options?.fieldMap && resolveFieldMapColumn(key, options.fieldMap))
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
