/**
 * Table-level JSON2 attribute sampling for non-Drilldown callers (the SQL builder on the
 * Traces query page): it has a table + database but no Drilldown context.
 *
 * Kept separate from `adapters/traces.ts` so both the drilldown suggest path and the query
 * builder share one query shape and one discovery rule set.
 */

import editorAPI from '@/api/editor'
import { attributeContainersOf, discoverSampledAttributes } from './attribute-keys'
import type { TraceBreakdownAttribute } from './field-map'

/** Rows sampled per table; enough to see rare attributes without scanning a big table. */
export const ATTRIBUTE_SAMPLE_LIMIT = 1000

export interface AttributeSampleOptions {
  database?: string
  table: string
  /** Physical column names of the table (from `SHOW` / schema store). */
  columns: readonly string[]
  /** Parent-span column; sampling prefers root spans because the traces views filter on it. */
  parentColumn?: string
  timeColumn?: string
  limit?: number
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function recordsToRows(
  records:
    | {
        schema?: { column_schemas?: Array<{ name: string }> }
        rows?: unknown[][]
      }
    | undefined
): Array<Record<string, unknown>> {
  const schemas = records?.schema?.column_schemas ?? []
  return (records?.rows ?? []).map((row) => {
    const entry: Record<string, unknown> = {}
    schemas.forEach((column, index) => {
      entry[column.name] = row?.[index]
    })
    return entry
  })
}

/**
 * Attribute dimensions of a trace table.
 *
 * Returns `[]` for v1 tables (attributes are physical columns there, so discovery reads the
 * schema). For v2 tables the keys are sampled from the newest rows: attribute keys describe
 * the table, not the selected time window, and a window without data must not empty the
 * list. Root spans are sampled first because the traces list / RED / breakdown queries all
 * filter `parent_span_id IS NULL`; keys that only exist on child spans can never match.
 */
export async function fetchSampledAttributes(options: AttributeSampleOptions): Promise<TraceBreakdownAttribute[]> {
  const { database, table } = options
  const containers = attributeContainersOf(options.columns)
  if (!table || !containers.length) {
    return []
  }

  const limit = options.limit ?? ATTRIBUTE_SAMPLE_LIMIT
  const select = containers.map(quoteIdent).join(', ')
  const orderBy = options.timeColumn ? `ORDER BY ${quoteIdent(options.timeColumn)} DESC` : ''
  const buildSql = (rootOnly: boolean): string => {
    const where = rootOnly && options.parentColumn ? `WHERE ${quoteIdent(options.parentColumn)} IS NULL` : ''
    return `SELECT ${select}\nFROM ${quoteIdent(table)}\n${where}\n${orderBy}\nLIMIT ${limit}`
  }

  const run = async (rootOnly: boolean) => {
    const response = await editorAPI.runSQL(buildSql(rootOnly), database)
    return recordsToRows(response?.output?.[0]?.records)
  }

  try {
    let rows = await run(true)
    if (!rows.length) {
      // Tables written without root spans (all children) would otherwise suggest nothing.
      rows = await run(false)
    }
    return discoverSampledAttributes(containers, rows)
  } catch (error) {
    console.error('Failed to sample trace attribute keys:', error)
    return []
  }
}

export interface AttributeValuesOptions {
  database?: string
  table: string
  /** JSON2 container column (`span_attributes`, `resource_attributes`, …). */
  column: string
  /** Attribute key inside the container (may contain dots). */
  path: string
  limit?: number
}

/**
 * Distinct values of one attribute key, for the value combobox.
 *
 * Always a string read: this feeds suggestions, not comparisons — numeric comparisons go
 * through the typed cast in `sqlJsonAttrExpr`.
 */
export async function fetchAttributeDistinctValues(options: AttributeValuesOptions): Promise<string[]> {
  const { database, table, column, path } = options
  if (!table || !column || !path) {
    return []
  }
  const limit = options.limit ?? 200
  const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''")
  const expr = `json_get_string(${quoteIdent(column)}, '$."${escapedPath}"')`

  const sql = `SELECT DISTINCT ${expr} AS value
FROM ${quoteIdent(table)}
WHERE ${expr} IS NOT NULL
LIMIT ${limit}`

  try {
    const response = await editorAPI.runSQL(sql, database)
    const rows = response?.output?.[0]?.records?.rows ?? []
    return [...new Set(rows.map((row) => String(row?.[0] ?? '')).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right)
    )
  } catch (error) {
    console.error(`Failed to load values for ${column}.${path}:`, error)
    return []
  }
}

export { escapeSqlString }

// ---------------------------------------------------------------------------
// Physical columns — the SQL builder suggests values for label-like columns too
// ---------------------------------------------------------------------------

/** Columns that only hold identity/high-cardinality values; a dropdown is noise. */
const HIGH_CARDINALITY_COLUMNS = new Set([
  'trace_id',
  'span_id',
  'parent_span_id',
  'trace_state',
  'span_events',
  'span_links',
])

/**
 * Whether a physical column is worth a value dropdown.
 *
 * Enumerable columns (`service_name`, `span_name`, `span_kind`, `span_status_code`, …) are
 * the point of this feature; numbers/booleans are typed instead, timestamps never repeat,
 * and identity columns would return 200 arbitrary ids while still scanning the window.
 */
export function canSuggestColumnValues(column: { name: string; data_type?: string }): boolean {
  const name = column.name
  const type = (column.data_type || '').toLowerCase()
  if (!type) {
    return false
  }
  if (
    type.includes('json') ||
    type.includes('binary') ||
    type.includes('vector') ||
    type.includes('bool') ||
    type.includes('timestamp') ||
    type.includes('date') ||
    type.includes('int') ||
    type.includes('uint') ||
    type.includes('float') ||
    type.includes('double') ||
    type.includes('decimal')
  ) {
    return false
  }
  if (HIGH_CARDINALITY_COLUMNS.has(name)) {
    return false
  }
  return !name.endsWith('_id')
}

export interface ColumnValuesOptions {
  database?: string
  table: string
  column: string
  limit?: number
}

/** Distinct values of a physical column, for the value combobox. */
export async function fetchColumnDistinctValues(options: ColumnValuesOptions): Promise<string[]> {
  const { database, table, column } = options
  if (!table || !column) {
    return []
  }
  const limit = options.limit ?? 200
  const sql = `SELECT DISTINCT ${quoteIdent(column)} AS value
FROM ${quoteIdent(table)}
WHERE ${quoteIdent(column)} IS NOT NULL
LIMIT ${limit}`

  try {
    const response = await editorAPI.runSQL(sql, database)
    const rows = response?.output?.[0]?.records?.rows ?? []
    return [...new Set(rows.map((row) => String(row?.[0] ?? '')).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right)
    )
  } catch (error) {
    console.error(`Failed to load values for ${column}:`, error)
    return []
  }
}
