import axios from 'axios'
import type { TableData } from '@arco-design/web-vue/es/table/interface'

export interface ContentDataRecord {
  x: string
  y: number
}

export function queryContentData() {
  return axios.get<ContentDataRecord[]>('/api/content-data')
}

export function queryChartData() {
  // return axios.get<any>('/api/v1/sql?sql=SELECT * FROM monitor')
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

export interface PopularRecord {
  key: number
  clickNumber: string
  title: string
  increases: number
}

export function queryPopularList(params: { type: string }) {
  return axios.get<TableData[]>('/api/popular/list', { params })
}
