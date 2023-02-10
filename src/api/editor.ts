import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const promURL = `/v1/promql`
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
      schema: appStore.database,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
}

const makePromParams = (code: string) => {
  return {
    params: {
      query: code,
    },
  } as AxiosRequestConfig
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
  return axios.post(sqlUrl, makeSqlData(`select * from scripts where schema = '${db}'`))
}

const saveScript = (name: string, code: string) => {
  return axios.post(scriptUrl, code, makeScriptConfig(name))
}

const runScript = (name: string) => {
  return axios.post(runScriptUrl, {}, makeScriptConfig(name))
}

const runProm = (code: string) => {
  return axios.post(promURL, {}, makePromParams(code))
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
