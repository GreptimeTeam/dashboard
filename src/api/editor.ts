import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const textHeaders = {
  'Content-Type': 'text/plain',
} as AxiosRequestHeaders

const makeSqlData = (sql: string) => {
  return qs.stringify({
    sql,
  })
}

const makeScriptConfig = (name: string) => {
  const appStore = useAppStore()
  return {
    params: {
      name,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
}

const getDatabases = () => {
  return axios.post(sqlUrl, makeSqlData(`show databases`))
}

const getTables = () => {
  return axios.post(sqlUrl, makeSqlData(`show tables`))
}

const getTableByName = (tableName: string) => {
  return axios.post(sqlUrl, makeSqlData(`desc table ${tableName}`))
}

const getSqlResult = (code: string) => {
  return axios.post(sqlUrl, makeSqlData(code))
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

export default {
  getTables,
  getTableByName,
  getSqlResult,
  getDatabases,
  getScriptsTable,
  runScript,
  saveScript,
}
