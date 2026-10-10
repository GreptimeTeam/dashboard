import axios, { AxiosRequestConfig } from 'axios'
import qs from 'qs'

export type TableSchemaColumn = {
  name: string
  data_type: string
  semantic_type: string
}

export type TableSchemaScope = {
  catalog: string
  schema: string
  db: string
}

const sqlUrl = '/v1/sql'

function makeSqlData(sql: string) {
  return qs.stringify({ sql })
}

function addDatabaseParams(db: string): AxiosRequestConfig {
  return {
    params: { db },
  }
}

/** Network-only schema fetch. No Pinia imports (avoids editor ↔ app cycles). */
export default async function requestTableSchema(
  tableName: string,
  scope: TableSchemaScope
): Promise<TableSchemaColumn[]> {
  const res: any = await axios.post(
    sqlUrl,
    makeSqlData(
      `SELECT column_name, data_type, semantic_type FROM information_schema.columns WHERE table_name = '${tableName}' AND table_catalog = '${scope.catalog}' AND table_schema = '${scope.schema}' ORDER BY column_name`
    ),
    addDatabaseParams(scope.db)
  )
  return (res.output[0].records.rows as string[][]).map((row) => ({
    name: row[0],
    data_type: row[1],
    semantic_type: row[2],
  }))
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Batched schema fetch: one information_schema.columns query for many tables, grouped
 * by table name client-side. Tables absent from the result are absent from the object.
 */
export async function requestTableSchemas(
  tables: string[],
  scope: TableSchemaScope
): Promise<Record<string, TableSchemaColumn[]>> {
  if (!tables.length) {
    return {}
  }
  const nameList = tables.map((table) => `'${escapeSqlLiteral(table)}'`).join(', ')
  const res: any = await axios.post(
    sqlUrl,
    makeSqlData(
      `SELECT table_name, column_name, data_type, semantic_type FROM information_schema.columns WHERE table_catalog = '${escapeSqlLiteral(
        scope.catalog
      )}' AND table_schema = '${escapeSqlLiteral(
        scope.schema
      )}' AND table_name IN (${nameList}) ORDER BY table_name, column_name`
    ),
    addDatabaseParams(scope.db)
  )
  const rows: string[][] = res.output[0].records.rows ?? []
  const byTable: Record<string, TableSchemaColumn[]> = {}
  rows.forEach((row) => {
    const [table, name, dataType, semanticType] = row
    if (!table) {
      return
    }
    byTable[table] = byTable[table] ?? []
    byTable[table].push({ name, data_type: dataType, semantic_type: semanticType })
  })
  return byTable
}

/**
 * Tables in the scope carrying `column` — the cheap signal pre-filter. Only
 * trace_id-bearing tables can join trace → logs association, so candidate schema
 * fetches shrink to a handful instead of every undeclared table in the database.
 */
export async function requestTablesHavingColumn(column: string, scope: TableSchemaScope): Promise<string[]> {
  const res: any = await axios.post(
    sqlUrl,
    makeSqlData(
      `SELECT table_name FROM information_schema.columns WHERE table_catalog = '${escapeSqlLiteral(
        scope.catalog
      )}' AND table_schema = '${escapeSqlLiteral(scope.schema)}' AND column_name = '${escapeSqlLiteral(
        column
      )}' GROUP BY table_name ORDER BY table_name LIMIT 500`
    ),
    addDatabaseParams(scope.db)
  )
  const rows: string[][] = res.output[0].records.rows ?? []
  return rows.map((row) => String(row[0] ?? '')).filter(Boolean)
}
