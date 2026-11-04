/**
 * One value-suggestion policy for every SQL signal surface: the Explore top filter and the
 * Traces SQL builder must agree on which fields offer a dropdown and how that list is read.
 *
 * The policy is deliberately conservative — suggestions are only worth a query when the
 * field is label-like: strings with a small value set. Numbers/booleans are typed,
 * timestamps and identity columns never repeat, and high-cardinality keys make the list
 * arbitrary while still scanning the window.
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
  /** Sampled cardinality for attributes; unknown for physical columns. */
  cardinality?: 'low' | 'high'
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

export function isHighCardinalityColumnName(name: string): boolean {
  return HIGH_CARDINALITY_COLUMNS.has(name) || name.endsWith('_id')
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
  if (field.cardinality === 'high') {
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
