import { successResponseWrap } from '@/utils/setup-mock'
import axios from 'axios'

export interface SqlSentence {
  sentence: Array<string>
}
export function postSqlSentence() {
  //   return axios.post<SqlSentence>('/api/monitor/sql')
  return successResponseWrap(true)
}
// todo: this next function is the same as the upper one
export function getSqlResult() {
  //   return axios.post<SqlSentence>('/api/monitor/sql')
  return {
    output: {
      records: {
        rows: [
          ['host1', 1660897955, 66.6, 1024.0],
          ['host2', 1660897956, 77.7, 2048.0],
          ['host1', 1660897957, 63.6, 1024.0],
          ['host1', 1660897958, 66.6, 1024.0],
          ['host1', 1660897959, 90.6, 2000.0],
          ['host1', 1660897960, 80.6, 1000.0],
          ['host1', 1660897961, 66.6, 1024.0],
        ],
        schema: {
          column_schemas: [
            {
              data_type: 'String',
              name: 'host',
            },
            {
              data_type: 'Timestamp',
              name: 'ts',
            },
            {
              data_type: 'Float64',
              name: 'cpu',
            },
            {
              data_type: 'Float64',
              name: 'memory',
            },
          ],
        },
      },
    },
    success: true,
  }
}
