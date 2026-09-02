import editorApi from '@/api/editor'

const LOG_TABLE_HEURISTICS = [/log/i, /otel_logs/i, /greptime_log/i]

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

export async function resolveLogsTable(): Promise<string | undefined> {
  try {
    const semantics = await editorApi.runSQL(
      `SELECT table_name FROM information_schema.table_semantics WHERE signal_type = 'log' LIMIT 10`
    )
    const fromSemantics = pickLogTableFromNames(tableNamesFromRecords(semantics?.output?.[0]?.records))
    if (fromSemantics) {
      return fromSemantics
    }
  } catch {
    // table_semantics may be unavailable on older deployments.
  }

  try {
    const tables = await editorApi.getTables(200, 0)
    const names = tableNamesFromRecords(tables?.output?.[0]?.records)
    return pickLogTableFromNames(names)
  } catch (error) {
    console.error('Failed to resolve logs table:', error)
    return undefined
  }
}

export async function buildDefaultLogsFieldMap(tableName: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {}

  try {
    const columns = await editorApi.getTableSchema(tableName)
    columns.forEach((column) => {
      if (column.semantic_type === 'TAG' || column.semantic_type === 'FIELD') {
        map[column.name] = column.name
      }
    })

    const columnNames = new Set(columns.map((column) => column.name))
    const aliasEntries: Array<[string, string]> = [
      ['service', 'service_name'],
      ['job', 'scope_name'],
      ['trace_id', 'trace_id'],
      ['severity', 'severity_text'],
    ]
    aliasEntries.forEach(([chipKey, columnName]) => {
      if (columnNames.has(columnName) && !map[chipKey]) {
        map[chipKey] = columnName
      }
    })
  } catch (error) {
    console.error(`Failed to build field map for ${tableName}:`, error)
  }

  return map
}
