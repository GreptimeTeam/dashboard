import editorApi from '@/api/editor'
import { currentDatabase } from '../current-database'
import { loadDrilldownSettings } from '../drilldown-settings'
import { buildLogsFieldMap } from './field-map'

const LOG_TABLE_HEURISTICS = [/log/i]

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

function pickLogTableFromNames(names: string[]): string | undefined {
  if (!names.length) {
    return undefined
  }
  if (names.length === 1) {
    return names[0]
  }
  const heuristic = names.find((name) => LOG_TABLE_HEURISTICS.some((pattern) => pattern.test(name)))
  return heuristic ?? names[0]
}

async function listSemanticsLogTables(): Promise<string[]> {
  try {
    // `table_schema` is required: information_schema spans every schema of the current
    // catalog, and without it a same-named log table from another schema can win.
    const semantics = await editorApi.runSQL(
      `SELECT table_name FROM information_schema.table_semantics WHERE signal_type = 'log' AND table_schema = '${currentDatabase()}' ORDER BY table_name LIMIT 100`
    )
    return tableNamesFromRecords(semantics?.output?.[0]?.records)
  } catch {
    return []
  }
}

async function listHeuristicLogTables(): Promise<string[]> {
  try {
    const tables = await editorApi.getTables(500, 0)
    const names = tableNamesFromRecords(tables?.output?.[0]?.records)
    return names.filter((name) => LOG_TABLE_HEURISTICS.some((pattern) => pattern.test(name)))
  } catch (error) {
    console.error('Failed to list heuristic log tables:', error)
    return []
  }
}

/** Discover candidate logs tables.
 * Merges table_semantics(signal_type=log) with names containing "log".
 * Previously returned *only* semantics when any row existed, which hid non-standard tables.
 */
export async function listLogTables(options?: { include?: string[] }): Promise<string[]> {
  const [fromSemantics, fromHeuristic] = await Promise.all([listSemanticsLogTables(), listHeuristicLogTables()])
  const extras = (options?.include ?? []).filter(Boolean)
  return uniquePreserveOrder([...fromSemantics, ...fromHeuristic, ...extras])
}

/**
 * Resolve the bound logs table.
 * Priority: explicit override → URL/context (caller) → settings → semantics → heuristics.
 */
export async function resolveLogsTable(options?: {
  preferred?: string
  settingsTable?: string
}): Promise<string | undefined> {
  if (options?.preferred?.trim()) {
    return options.preferred.trim()
  }

  const settingsTable = options?.settingsTable ?? loadDrilldownSettings().logs.table
  if (settingsTable?.trim()) {
    return settingsTable.trim()
  }

  try {
    const fromSemantics = await listSemanticsLogTables()
    const picked = pickLogTableFromNames(fromSemantics)
    if (picked) {
      return picked
    }
  } catch {
    // table_semantics may be unavailable on older deployments.
  }

  try {
    const heuristic = await listHeuristicLogTables()
    return pickLogTableFromNames(heuristic)
  } catch (error) {
    console.error('Failed to resolve logs table:', error)
    return undefined
  }
}

/** @deprecated Prefer buildLogsFieldMap — kept for Related logs / existing callers. */
export async function buildDefaultLogsFieldMap(tableName: string): Promise<Record<string, string>> {
  const settings = loadDrilldownSettings().logs.fieldMap
  return buildLogsFieldMap(tableName, settings)
}
