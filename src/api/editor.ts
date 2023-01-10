import axios from 'axios'

function makeSqlURL(code: string) {
  const appStore = useAppStore()
  return `/api/v1/sql?sql=${code}&database=${appStore.database}`
}

export function getSqlResult(code: string) {
  return axios.post(makeSqlURL(code))
}

export function getTables() {
  return axios.post(makeSqlURL('show tables'))
}

export function fetchOneTable(tableName: any) {
  return axios.post(makeSqlURL(`desc table ${tableName}`))
}

export function postScripts(name: string, code: any) {
  return axios.post(`/api/v1/scripts?name=${name}`, code)
}

export function postRunScriptName(name: string) {
  return axios.post(`/api/v1/run-script?name=${name}`)
}
