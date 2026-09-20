import editorApi from '@/api/editor'
import { currentDatabase } from '../current-database'
import { loadDrilldownSettings } from '../drilldown-settings'
import { TRACE_MODEL_REQUIRED_COLUMNS } from './model'
import {
  KNOWN_OTLP_TRACE_TABLE,
  tableHasRequiredTraceColumns,
  traceModelScore,
  type SchemaColumnLike,
} from './field-map'

function tableNamesFromRecords(records: {
  rows?: string[][]
  schema?: { column_schemas?: Array<{ name: string }> }
}): string[] {
  const schemas = records?.schema?.column_schemas ?? []
  const tableNameIndex = schemas.findIndex((schema) => schema.name === 'table_name')
  if (tableNameIndex < 0 || !Array.isArray(records?.rows)) {
    return []
  }
  return records.rows.map((row) => String(row[tableNameIndex] ?? '')).filter(Boolean)
}

function uniquePreserveOrder(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  names.forEach((name) => {
    if (!name || seen.has(name)) {
      return
    }
    seen.add(name)
    result.push(name)
  })
  return result
}

async function listSemanticsTraceTables(): Promise<Array<{ tableName: string; pipeline?: string }>> {
  try {
    // Scoped + ordered: information_schema spans every schema of the current catalog.
    const semantics = await editorApi.runSQL(
      `SELECT table_name, pipeline FROM information_schema.table_semantics WHERE signal_type = 'trace' AND table_schema = '${currentDatabase()}' ORDER BY table_name LIMIT 100`
    )
    const records = semantics?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const nameIdx = schemas.findIndex((schema: { name: string }) => schema.name === 'table_name')
    const pipelineIdx = schemas.findIndex((schema: { name: string }) => schema.name === 'pipeline')
    if (nameIdx < 0 || !Array.isArray(records?.rows)) {
      return []
    }
    return records.rows
      .map((row: string[]) => ({
        tableName: String(row[nameIdx] ?? ''),
        pipeline: pipelineIdx >= 0 ? String(row[pipelineIdx] ?? '') || undefined : undefined,
      }))
      .filter((row: { tableName: string }) => Boolean(row.tableName))
  } catch {
    return []
  }
}

async function listColumnModelTraceTables(): Promise<string[]> {
  try {
    // Without the schema filter the GROUP BY unions columns from same-named tables in
    // different schemas, so a name can pass HAVING although no single table has all five.
    const modelColumns = TRACE_MODEL_REQUIRED_COLUMNS.map((name) => `'${name}'`).join(', ')
    const sql = `SELECT table_name
FROM information_schema.columns
WHERE table_schema = '${currentDatabase()}'
  AND column_name IN (${modelColumns})
GROUP BY table_name
HAVING COUNT(DISTINCT column_name) = ${TRACE_MODEL_REQUIRED_COLUMNS.length}
ORDER BY table_name
LIMIT 200`
    const result = await editorApi.runSQL(sql)
    return tableNamesFromRecords(result?.output?.[0]?.records)
  } catch (error) {
    console.error('Failed to list column-model trace tables:', error)
    return []
  }
}

async function loadColumnNames(tableName: string): Promise<string[]> {
  try {
    const columns = (await editorApi.getTableSchema(tableName)) as SchemaColumnLike[]
    return columns.map((column) => column.name)
  } catch {
    return []
  }
}

/**
 * Discover candidate traces tables.
 * Merges: table_semantics(signal_type=trace) ∪ required-column model check ∪ known OTLP name.
 */
export async function listTracesTables(options?: { include?: string[] }): Promise<string[]> {
  const [fromSemantics, fromColumns] = await Promise.all([listSemanticsTraceTables(), listColumnModelTraceTables()])

  const pipelineByTable = new Map(fromSemantics.map((row) => [row.tableName, row.pipeline]))
  const candidates = uniquePreserveOrder([
    ...fromSemantics.map((row) => row.tableName),
    ...fromColumns,
    ...(options?.include ?? []).filter(Boolean),
    KNOWN_OTLP_TRACE_TABLE,
  ])

  const scored: Array<{ name: string; score: number }> = []
  await Promise.all(
    candidates.map(async (name) => {
      const columnNames = await loadColumnNames(name)
      if (!columnNames.length) {
        // Keep semantics-only names even if schema fetch fails (settings / allow-create).
        if (pipelineByTable.has(name) || options?.include?.includes(name)) {
          scored.push({
            name,
            score: traceModelScore([], { pipeline: pipelineByTable.get(name), tableName: name }),
          })
        }
        return
      }
      if (!tableHasRequiredTraceColumns(columnNames) && !pipelineByTable.has(name)) {
        return
      }
      scored.push({
        name,
        score: traceModelScore(columnNames, { pipeline: pipelineByTable.get(name), tableName: name }),
      })
    })
  )

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.name.localeCompare(right.name)
  })

  return scored.map((row) => row.name)
}

/**
 * Resolve the bound traces table.
 * Priority: preferred → settings → ranked listTracesTables first hit.
 */
export async function resolveTracesTable(options?: {
  preferred?: string
  settingsTable?: string
}): Promise<string | undefined> {
  if (options?.preferred?.trim()) {
    return options.preferred.trim()
  }

  const settingsTable = options?.settingsTable ?? loadDrilldownSettings().traces?.table
  if (settingsTable?.trim()) {
    return settingsTable.trim()
  }

  const listed = await listTracesTables()
  return listed[0]
}
