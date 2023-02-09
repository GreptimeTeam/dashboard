import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const textHeaders = {
  'Content-Type': 'text/plain',
} as AxiosRequestHeaders

const makeSqlData = (sql: string) => {
  const appStore = useAppStore()
  return qs.stringify({
    sql,
    db: appStore.database,
  })
}

const makeSqlDataWithoutDB = (sql: string) => {
  return qs.stringify({
    sql,
  })
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

const getSqlResult = (code: string) => {
  return axios.post(sqlUrl, makeSqlData(code))
}

const getScriptsTable = (db: string) => {
  return axios.post(sqlUrl, makeSqlDataWithoutDB(`select * from scripts where schema = '${db}'`))
}

const getTables = () => {
  return axios.post(sqlUrl, makeSqlData(`show tables`))
}

const getTableByName = (tableName: string) => {
  return axios.post(sqlUrl, makeSqlData(`desc table ${tableName}`))
}

const saveScript = (name: string, code: string) => {
  return axios.post(scriptUrl, code, makeScriptConfig(name))
}

const runScript = (name: string) => {
  return axios.post(runScriptUrl, {}, makeScriptConfig(name))
}

const getDatabases = () => {
  return axios.post(sqlUrl, makeSqlDataWithoutDB(`show databases`))
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
