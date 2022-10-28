import { successResponseWrap } from '@/utils/setup-mock'
import axios from 'axios'

export interface SqlSentence {
  sentence: Array<string>
}
export function postSqlSentence() {
  //   return axios.post<SqlSentence>('/api/monitor/sql')
  return successResponseWrap(true)
}
