import axios from 'axios'

export function getSqlResult(code: string) {
  return axios.post(`/api/v1/sql?sql=${encodeURIComponent(code)}`)
}

export function postScripts(name: string, code: string) {
  return axios.post(`/api/v1/scripts?name=${name}`, code)
}

export function postRunScriptName(name: string) {
  return axios.post(`/api/v1/run-script?name=${name}`)
}

export function getTables() {
  const code = 'show tables'
  return axios.post(`/api/v1/sql?sql=${code}`)
}

export function fetchOneTable(tableName: string) {
  const code = `desc table ${tableName}`
  return axios.post(`/api/v1/sql?sql=${code}`)
}
