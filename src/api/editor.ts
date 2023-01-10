import axios from 'axios'

function makeURL(code: string) {
  const appStore = useAppStore()
  return `/api/v1/sql?sql=${code}&database=${appStore.database}`
}

export function getSqlResult(code: any) {
  return axios.post(makeURL(code))
}

export function getTables() {
  return axios.post(makeURL('show tables'))
}

export function fetchOneTable(tableName: any) {
  return axios.post(makeURL(`desc table ${tableName}`))
}
