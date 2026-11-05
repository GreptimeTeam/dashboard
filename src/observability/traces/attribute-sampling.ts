/**
 * Table-level JSON2 attribute sampling for non-Drilldown callers (the SQL builder on the
 * Traces query page): it has a table + database but no Drilldown context.
 *
 * Kept separate from `adapters/traces.ts` so both the drilldown suggest path and the query
 * builder share one query shape and one discovery rule set.
 */

import editorAPI from '@/api/editor'
import { rememberAttributeTypes } from './attribute-keys'
import { jsonAttributeContainersOf, discoverSampledAttributes } from './attribute-keys'
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
 * Attribute dimensions of a trace or logs table.
 *
 * Returns `[]` for v1 tables (attributes are physical columns there, so discovery reads the
 * schema). For v2 tables the keys are sampled from the newest rows: attribute keys describe
 * the table, not the selected time window, and a window without data must not empty the
 * list. Root spans are sampled first because the traces list / RED / breakdown queries all
 * filter `parent_span_id IS NULL`; keys that only exist on child spans can never match.
 */
const attributeCache = new Map<string, TraceBreakdownAttribute[]>()
const ATTRIBUTE_CACHE_LIMIT = 32

/**
 * Cached wrapper: one sample per database + table, shared by traces and logs surfaces, and
 * publishes the sampled types so the operator menu can offer numeric comparisons.
 */
export async function fetchTableAttributeKeys(options: AttributeSampleOptions): Promise<TraceBreakdownAttribute[]> {
  const cacheKey = `${options.database ?? ''}\0${options.table}`
  const cached = attributeCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const attributes = await fetchSampledAttributes(options)
  rememberAttributeTypes(options.database, options.table, attributes)
  if (attributeCache.size > ATTRIBUTE_CACHE_LIMIT) {
    attributeCache.clear()
  }
  attributeCache.set(cacheKey, attributes)
  return attributes
}

export async function fetchSampledAttributes(options: AttributeSampleOptions): Promise<TraceBreakdownAttribute[]> {
  const { database, table } = options
  const containers = jsonAttributeContainersOf(options.columns)
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
