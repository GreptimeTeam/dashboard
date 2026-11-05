/**
 * One value-suggestion policy for every SQL signal surface: the Explore top filter and the
 * Traces SQL builder must agree on which fields offer a dropdown and how that list is read.
 *
 * The policy is static and deliberately conservative: only string-typed fields get a
 * dropdown, and identity columns (trace_id, *_id, id-suffixed keys) are excluded by name.
 * Numbers/booleans are typed by the user, timestamps never repeat, and payload JSON cannot
 * be listed. Cardinality is NOT measured — that would require a probe request per field and
 * behaved differently for v1 columns (never measured) and v2 attributes (sampled).
 */

import editorAPI from '@/api/editor'

/** Where a suggested value comes from: a physical column or a JSON attribute key. */
export type ValueSource = { kind: 'column'; column: string } | { kind: 'attribute'; column: string; path: string }

/** What the policy needs to know about a field. */
export interface SuggestFieldShape {
  /** Column name or attribute chip key (`span_attributes.http.method`). */
  name: string
  /** Schema type for columns, sampled type for attributes (`BIGINT`, `String`, …). */
  dataType?: string
}

/** Identity/payload columns: a dropdown of 200 arbitrary ids helps nobody. */
const HIGH_CARDINALITY_COLUMNS = new Set([
  'trace_id',
  'span_id',
  'parent_span_id',
  'trace_state',
  'span_events',
  'span_links',
])

const NUMERIC_TYPE_HINTS = ['int', 'uint', 'float', 'double', 'decimal', 'number']
const EXCLUDED_TYPE_HINTS = ['json', 'binary', 'vector', 'bool', 'timestamp', 'date']

/** `*_id`, `*-id`, `*.id` — ids are unbounded, and their dropdown would be arbitrary. */
const ID_NAME_SUFFIX = /(^|[._-])id$/i

export function isHighCardinalityColumnName(name: string): boolean {
  return HIGH_CARDINALITY_COLUMNS.has(name) || ID_NAME_SUFFIX.test(name)
}

/**
 * Whether a value dropdown is worth offering for this field.
 *
 * `operator` is optional: IN/NOT IN expect a comma-separated list, so a single-value
 * dropdown would mislead.
 */
export function canSuggestValues(field: SuggestFieldShape, operator?: string): boolean {
  if (operator === 'IN' || operator === 'NOT IN') {
    return false
  }
  const dataType = (field.dataType || '').toLowerCase()
  // Unknown type (an unsampled chip, a column the schema never described) stays suggestable:
  // the field is already known to be filterable, and guessing "not a string" would hide it.
  if (!dataType) {
    return !isHighCardinalityColumnName(field.name)
  }
  if (EXCLUDED_TYPE_HINTS.some((hint) => dataType.includes(hint))) {
    return false
  }
  if (NUMERIC_TYPE_HINTS.some((hint) => dataType.includes(hint))) {
    return false
  }
  if (isHighCardinalityColumnName(field.name)) {
    return false
  }
  return true
}

/**
 * Type used to decide suggestions for `key`.
 *
 * Filter chips accept `fieldMap` aliases (`duration` → `duration_nano`, `time` →
 * `timestamp`), but `columnTypes` is keyed by physical names, so looking the raw key up
 * would miss the type and let a numeric/timestamp field through as "unknown".
 */
export function resolveSuggestFieldType(
  key: string,
  options: {
    fieldMap?: Record<string, string>
    columnTypes?: Record<string, string>
    /** Sampled type for JSON2 attribute chips. */
    attributeType?: string
  }
): string | undefined {
  const mapped = options.fieldMap?.[key]?.trim()
  const mappedType = mapped ? options.columnTypes?.[mapped] : undefined
  return mappedType || options.columnTypes?.[key] || options.attributeType
}

/**
 * Signature of the view that a suggested value list was fetched for.
 *
 * Explore scopes `SELECT DISTINCT` by the time window and by the other committed `=`
 * filters, so a cached list must be dropped when either changes — otherwise the dropdown
 * keeps showing values from the previous window. Non-equality filters and ordering are
 * ignored because they never reach the suggestion query.
 */
export function suggestionScopeKey(
  filters: ReadonlyArray<{ key: string; op: string; value: unknown }>,
  range: readonly number[]
): string {
  const equalities = filters
    .filter((filter) => filter.op === '=')
    .map((filter) => `${filter.key}\u0000${String(filter.value)}`)
    .sort()
  return `${range.join(',')}\u0001${equalities.join('\u0002')}`
}

export interface DistinctValuesOptions {
  database?: string
  table: string
  source: ValueSource
  /** Time window applied to the suggestion scan (Explore); the builder passes none. */
  timeColumn?: string
  timeRange?: number[]
  /** Predicates from other committed filters (Explore); the builder passes none. */
  extraWhere?: string[]
  limit?: number
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** SQL expression the suggestions read, used both for SELECT and the NULL check. */
export function valueSourceExpr(source: ValueSource): string {
  if (source.kind === 'column') {
    return quoteIdent(source.column)
  }
  const escapedPath = source.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''")
  return `json_get_string(${quoteIdent(source.column)}, '$."${escapedPath}"')`
}

/** Distinct values for the combobox; always a string read, sorted and de-duplicated. */
export async function fetchDistinctValues(options: DistinctValuesOptions): Promise<string[]> {
  const { database, table, source } = options
  if (!table) {
    return []
  }
  const expr = valueSourceExpr(source)
  const whereParts = [`${expr} IS NOT NULL`]
  const range = options.timeRange ?? []
  if (options.timeColumn && range.length === 2) {
    whereParts.push(`${quoteIdent(options.timeColumn)} >= FROM_UNIXTIME(${range[0]})`)
    whereParts.push(`${quoteIdent(options.timeColumn)} <= FROM_UNIXTIME(${range[1]})`)
  }
  ;(options.extraWhere ?? []).forEach((clause) => {
    if (clause.trim()) {
      whereParts.push(clause)
    }
  })

  const sql = `SELECT DISTINCT ${expr} AS value
FROM ${quoteIdent(table)}
WHERE ${whereParts.join(' AND ')}
LIMIT ${options.limit ?? 200}`

  try {
    const response = await editorAPI.runSQL(sql, database)
    const rows = (response?.output?.[0]?.records?.rows ?? []) as unknown[][]
    return [...new Set(rows.map((row) => String(row?.[0] ?? '')).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right)
    )
  } catch (error) {
    console.error(
      `Failed to load suggested values for ${
        source.kind === 'column' ? source.column : `${source.column}.${source.path}`
      }:`,
      error
    )
    return []
  }
}
