import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`
const textHeaders = {
  'Content-Type': 'text/plain',
} as AxiosRequestHeaders

function makeSqlData(sql: string) {
  const appStore = useAppStore()
  return qs.stringify({
    sql,
    db: appStore.database,
  })
}

function makeSqlDataNoDB(sql: string) {
  return qs.stringify({
    sql,
  })
}

function makeScriptConfig(name: string) {
  const appStore = useAppStore()
  return {
    params: {
      name,
      schema: appStore.database,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
}

export function getSqlResult(code: string) {
  return axios.post(sqlUrl, makeSqlData(code))
}

export function getScriptsList(db: string) {
  return axios.post(sqlUrl, makeSqlDataNoDB(`select * from scripts where schema = '${db}'`))
}

export function getTables() {
  return axios.post(sqlUrl, makeSqlData(`show tables`))
}

export function fetchOneTable(tableName: string) {
  return axios.post(sqlUrl, makeSqlData(`desc table ${tableName}`))
}

export function postScripts(name: string, code: string) {
  return axios.post(scriptUrl, code, makeScriptConfig(name))
}

export function postRunScriptName(name: string) {
  return axios.post(runScriptUrl, {}, makeScriptConfig(name))
}

export function getDatabases() {
  return axios.post(sqlUrl, makeSqlDataNoDB(`show databases`))
}
