import axios from 'axios'

export function getSqlResult(code: any) {
  return axios.post(`/api/v1/sql?sql= ${code}`)
}

export function getTables() {
  const code = 'show tables'
  return axios.post(`/api/v1/sql?sql= ${code}`)
}

export function fetchOneTable(tableName: any) {
  const code = `desc table ${tableName}`
  return axios.post(`/api/v1/sql?sql= ${code}`)
}
