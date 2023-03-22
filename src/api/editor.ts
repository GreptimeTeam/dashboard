import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const promUrl = `/v1/promql`
const textHeaders = {
  'Content-Type': 'text/plain',
} as AxiosRequestHeaders

const makeSqlData = (sql: string) => {
  return qs.stringify({
    sql,
  })
}

const addDatabaseParams = () => {
  const appStore = useAppStore()
  return {
    params: {
      db: appStore.database,
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

const makePromParams = (code: string) => {
  return {
    params: {
      query: code,
    },
  }
}

const getDatabases = () => {
  return axios.post(sqlUrl, makeSqlData(`show databases`))
}

const getTables = () => {
  return axios.post(sqlUrl, makeSqlData(`show tables`), addDatabaseParams())
}

const getTableByName = (tableName: string) => {
  return axios.post(sqlUrl, makeSqlData(`desc table ${tableName}`), addDatabaseParams())
}

const getSqlResult = (code: string) => {
  return axios.post(sqlUrl, makeSqlData(code), addDatabaseParams())
}

const getScriptsTable = (db: string) => {
  // TODO: update to system schema when upstream ready
  return axios.post(sqlUrl, makeSqlData(`select * from public.scripts where schema = '${db}'`))
}

const saveScript = (name: string, code: string) => {
  return axios.post(scriptUrl, code, makeScriptConfig(name))
}

const runScript = (name: string) => {
  return axios.post(runScriptUrl, {}, makeScriptConfig(name))
}

const runProm = (code: string) => {
  return axios.post(promUrl, makePromParams(code))
}

export default {
  getTables,
  getTableByName,
  getSqlResult,
  getDatabases,
  getScriptsTable,
  runScript,
  saveScript,
  runProm,
}
