import axios from 'axios'

function makeSqlURL(code: string) {
  const appStore = useAppStore()
  return `/v1/sql?sql=${code}&db=${appStore.database}`
}

export function getSqlResult(code: string) {
  return axios.post(makeSqlURL(code))
}

export function getTables() {
  return axios.post(makeSqlURL('show tables'))
}

export function fetchOneTable(tableName: string) {
  return axios.post(makeSqlURL(`desc table ${tableName}`))
}

export function postScripts(name: string, code: string) {
  return axios.post(`/v1/scripts?name=${name}`, code)
}

export function postRunScriptName(name: string) {
  return axios.post(`/v1/run-script?name=${name}`)
}

export function getDatabases() {
  return axios.post(`/v1/sql?sql=show databases`)
}
