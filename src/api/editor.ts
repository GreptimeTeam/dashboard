import axios, { AxiosRequestConfig } from 'axios'
import qs from 'qs'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`

function makeSqlData(sql: string) {
  const appStore = useAppStore()
  return qs.stringify({
    sql,
    db: appStore.database,
  })
}

function makeSqlDataNoDB(sql: string) {
  const appStore = useAppStore()
  return qs.stringify({
    sql,
  })
}

function makeScriptParams(name: string) {
  const appStore = useAppStore()
  return {
    params: {
      name,
      schema: appStore.database,
    },
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
  return axios.post(scriptUrl, code, makeScriptParams(name))
}

export function postRunScriptName(name: string) {
  return axios.post(runScriptUrl, {}, makeScriptParams(name))
}

export function getDatabases() {
  return axios.post(sqlUrl, makeSqlDataNoDB(`show databases`))
}
