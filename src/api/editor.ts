import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import dayjs from 'dayjs'
import qs from 'qs'
import { PromForm } from '@/store/modules/code-run/types'
import requestTableSchema from '@/api/table-schema-fetch'
import { calculateRange } from '@/utils/date-time'
import { HttpResponse } from './interceptor'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const promURL = `/v1/promql`
const influxURL = `/v1/influxdb`
const promRangeURL = `/v1/prometheus/api/v1/query_range`

const textHeaders = {
  'Content-Type': 'text/plain',
} as AxiosRequestHeaders

const makeSqlData = (sql: string) => {
  return qs.stringify({
    sql,
  })
}

const addDatabaseParams = (database?: string) => {
  const appStore = useAppStore()
  return {
    params: {
      db: database || appStore.database,
    },
  } as AxiosRequestConfig
}

const makeScriptConfig = (name: string) => {
  const appStore = useAppStore()
  return {
    params: {
      name,
      db: appStore.database,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
}

const makePromParams = (code: string, promForm: PromForm, format?: string) => {
  const appStore = useAppStore()
  const [start, end] = calculateRange(promForm.time, promForm.range)
  return {
    params: {
      query: code,
      start,
      end,
      step: promForm.step,
      db: appStore.database,
      format,
    },
  } as AxiosRequestConfig
}

const getDatabases = () => {
  return axios.post(sqlUrl, makeSqlData(`show databases`))
}

const getTables = (limit?: number, offset?: number, database?: string) => {
  const appStore = useAppStore()
  const db = database || appStore.database
  const suffix = `limit ${limit} offset ${offset}`
  return axios.post(
    sqlUrl,
    makeSqlData(
      `select * from information_schema.tables where table_schema='${db}' order by table_name ${limit ? suffix : ''};`
    ),
    addDatabaseParams(db)
  )
}

const fetchTablesCount = (database?: string) => {
  const appStore = useAppStore()
  return axios.post(
    sqlUrl,
    makeSqlData(`select count(*) from information_schema.tables where table_schema='${database || appStore.database}';`)
  )
}

const getTableByName = (tableName: string, database?: string) => {
  const appStore = useAppStore()
  return axios.post(
    sqlUrl,
    makeSqlData(
      `select * from information_schema.columns where table_name='${tableName}' and table_schema='${
        database || appStore.database
      }';`
    )
  )
}

function runSQL(code: string): Promise<HttpResponse>
function runSQL(code: string, database: string, config?: AxiosRequestConfig): Promise<HttpResponse>
function runSQL(code: string, database?: string, config?: AxiosRequestConfig): Promise<HttpResponse> {
  const baseConfig = addDatabaseParams(database)
  const mergedConfig = {
    ...baseConfig,
    ...config,
    params: {
      ...baseConfig.params,
      ...config?.params,
    },
  } as AxiosRequestConfig
  return axios.post(sqlUrl, makeSqlData(code), mergedConfig)
}

const checkScriptsTable = () => {
  return axios.post(sqlUrl, makeSqlData(`select count(1) from information_schema.tables where table_name='scripts';`))
}

const getScriptsTable = () => {
  const appStore = useAppStore()
  return axios.post(
    sqlUrl,
    makeSqlData(`select * from public.scripts where schema = '${appStore.database}' order by gmt_modified desc;`)
  )
}

const saveScript = (name: string, code: string) => {
  return axios.post(scriptUrl, code, makeScriptConfig(name))
}

const runScript = (name: string, config?: AxiosRequestConfig) => {
  const baseConfig = makeScriptConfig(name)
  return axios.post(
    runScriptUrl,
    {},
    {
      ...baseConfig,
      ...config,
      params: {
        ...baseConfig.params,
        ...config?.params,
      },
    }
  )
}

const runPromQL = (code: string, promForm: PromForm, format?: string, config?: AxiosRequestConfig) => {
  const baseConfig = makePromParams(code, promForm, format)
  return axios.post(
    promURL,
    {},
    {
      ...baseConfig,
      ...config,
      params: {
        ...baseConfig.params,
        ...config?.params,
      },
    }
  )
}

const writeInfluxDB = (data: string, precision: string) => {
  const appStore = useAppStore()
  const config = {
    params: {
      db: appStore.database,
      precision,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
  return axios.post(`${influxURL}/write`, data, config)
}

const runSQLWithCSV = (code: string, format?: string): Promise<HttpResponse> => {
  const params = addDatabaseParams()
  params.params.format = format || 'csvWithNames'
  return axios.post(sqlUrl, makeSqlData(code), params)
}

/**
 * Typed table schema (column_name, data_type, semantic_type).
 * Drilldown paths should prefer useTableSchemaStore().ensureTableSchema for session cache.
 */
const getTableSchema = (tableName: string, database?: string) => {
  const appStore = useAppStore()
  const { tableSchema, tableCatalog } = storeToRefs(appStore)
  let catalog = tableCatalog.value
  let schema = tableSchema.value

  if (database) {
    const parts = database.split('-')
    if (parts.length > 1) {
      catalog = parts.slice(0, -1).join('-') || catalog
      schema = parts[parts.length - 1] || schema
    } else {
      schema = database
    }
  }

  return requestTableSchema(tableName, {
    catalog,
    schema,
    db: database || appStore.database,
  })
}

export default {
  getTables,
  getTableByName,
  runSQL,
  getDatabases,
  getScriptsTable,
  runScript,
  saveScript,
  runPromQL,
  writeInfluxDB,
  checkScriptsTable,
  fetchTablesCount,
  runSQLWithCSV,
  getTableSchema,
}
