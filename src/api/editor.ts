import axios, { AxiosRequestConfig, AxiosRequestHeaders } from 'axios'
import dayjs from 'dayjs'
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
      db: appStore.database,
    },
    headers: textHeaders,
  } as AxiosRequestConfig
}

const makePromParams = (code: string) => {
  const { promForm } = useQueryCode()
  const appStore = useAppStore()
  if (promForm.value.isRelative) {
    // TODO: move this into a function?
    const now = dayjs()
    promForm.value.end = now.format('x')
    promForm.value.start = now.subtract(promForm.value.time, 'minute').format('x').toString()
  } else {
    ;[promForm.value.start, promForm.value.end] = promForm.value.range
  }
  return {
    params: {
      query: code,
      start: promForm.value.start,
      end: promForm.value.end,
      step: promForm.value.step,
      db: appStore.database,
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

const runSQL = (code: string) => {
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

const runPromQL = (code: string) => {
  return axios.post(promURL, {}, makePromParams(code))
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
}
