import axios, { AxiosRequestConfig } from 'axios'

const sqlUrl = `/v1/sql`
const scriptUrl = `/v1/scripts`
const runScriptUrl = `/v1/run-script`

function makeSqlParams(sql: string) {
  const appStore = useAppStore()
  return {
    params: {
      sql,
      db: appStore.database,
    },
  } as AxiosRequestConfig
}

function makeScriptParams(name: string) {
  return {
    params: {
      name,
    },
  } as AxiosRequestConfig
}

export function getSqlResult(code: string) {
  return axios.post(sqlUrl, {}, makeSqlParams(code))
}

export function getTables() {
  return axios.post(sqlUrl, {}, makeSqlParams('show tables'))
}

export function fetchOneTable(tableName: string) {
  return axios.post(sqlUrl, {}, makeSqlParams(`desc table ${tableName}`))
}

export function postScripts(name: string, code: string) {
  return axios.post(scriptUrl, code, makeScriptParams(name))
}

export function postRunScriptName(name: string) {
  return axios.post(runScriptUrl, {}, makeScriptParams(name))
}

export function getDatabases() {
  return axios.post(`${sqlUrl}?sql=show databases`)
}
