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
