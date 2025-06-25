import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import dayjs from 'dayjs'
import qs from 'qs'
import { PromForm } from '@/store/modules/code-run/types'
import { HttpResponse } from './interceptor'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const promURL = `/v1/promql`
const influxURL = `/v1/influxdb`

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
  let start
  let end
  const appStore = useAppStore()
  if (promForm.time !== 0) {
    const now = dayjs()
    end = now.unix().toString()
    start = now.subtract(promForm.time, 'minute').unix().toString()
  } else {
    ;[start, end] = promForm.range
  }

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
  const suffix = `limit ${limit} offset ${offset}`
  return axios.post(
    sqlUrl,
    makeSqlData(
      `select * from information_schema.tables where table_schema='${
        database || appStore.database
      }' order by table_name ${limit ? suffix : ''};`
    ),
    addDatabaseParams()
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

const runSQL = (code: string, database?: string): Promise<HttpResponse> => {
  return axios.post(sqlUrl, makeSqlData(code), addDatabaseParams(database))
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

const runScript = (name: string) => {
  return axios.post(runScriptUrl, {}, makeScriptConfig(name))
}

const runPromQL = (code: string, promForm: PromForm, format?: string) => {
  return axios.post(promURL, {}, makePromParams(code, promForm, format))
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
}
