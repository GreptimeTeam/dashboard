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

export function getTables() {
  return {
    query: 'tables();',
    columns: [
      {
        name: 'id',
        type: 'INT',
      },
      {
        name: 'name',
        type: 'STRING',
      },
      {
        name: 'designatedTimestamp',
        type: 'STRING',
      },
      {
        name: 'partitionBy',
        type: 'STRING',
      },
      {
        name: 'maxUncommittedRows',
        type: 'INT',
      },
      {
        name: 'commitLag',
        type: 'LONG',
      },
      {
        name: 'walEnabled',
        type: 'BOOLEAN',
      },
    ],
    dataset: [
      [2, 'weather', 'timestamp', 'NONE', 500000, '300000000', false],
      [121, 'pos', 'time', 'DAY', 500000, '300000000', false],
      [4, 'gas_prices', 'timestamp', 'NONE', 500000, '300000000', false],
      [5, 'trips', 'pickup_datetime', 'MONTH', 500000, '300000000', false],
      [10, 'trades', 'timestamp', 'DAY', 500000, '2000000', false],
    ],
    count: 5,
    timings: {
      compiler: 281451,
      execute: 560876,
      count: 0,
    },
  }
}

export function getTables2() {
  return {
    query: 'tables();',
    columns: [
      {
        name: 'id',
        type: 'INT',
      },
      {
        name: 'name',
        type: 'STRING',
      },
      {
        name: 'designatedTimestamp',
        type: 'STRING',
      },
      {
        name: 'partitionBy',
        type: 'STRING',
      },
      {
        name: 'maxUncommittedRows',
        type: 'INT',
      },
      {
        name: 'commitLag',
        type: 'LONG',
      },
      {
        name: 'walEnabled',
        type: 'BOOLEAN',
      },
    ],
    dataset: [
      [2, 'weatherdd', 'timestamp', 'NONE', 500000, '300000000', false],
      [121, 'pos2', 'time', 'DAY', 500000, '300000000', false],
      [4, 'gas_prices2', 'timestamp', 'NONE', 500000, '300000000', false],
      [5, 'trips2', 'pickup_datetime', 'MONTH', 500000, '300000000', false],
      [10, 'trades', 'timestamp', 'DAY', 500000, '2000000', false],
    ],
    count: 5,
    timings: {
      compiler: 281451,
      execute: 560876,
      count: 0,
    },
  }
}

export function getOneColumn(key: any) {
  return {
    query: "SHOW COLUMNS FROM 'pos';",
    columns: [
      {
        name: 'column',
        type: 'STRING',
      },
      {
        name: 'type',
        type: 'STRING',
      },
      {
        name: 'indexed',
        type: 'BOOLEAN',
      },
      {
        name: 'indexBlockCapacity',
        type: 'INT',
      },
      {
        name: 'symbolCached',
        type: 'BOOLEAN',
      },
      {
        name: 'symbolCapacity',
        type: 'INT',
      },
      {
        name: 'designated',
        type: 'BOOLEAN',
      },
    ],
    dataset: [
      ['time', 'TIMESTAMP', false, 0, false, 0, true],
      ['id', 'SYMBOL', true, 512, true, 256, false],
      ['lat', 'DOUBLE', false, 0, false, 0, false],
      ['lon', 'DOUBLE', false, 0, false, 0, false],
      ['geo6', 'GEOHASH(6c)', false, 0, false, 0, false],
      ['geo12', 'GEOHASH(12c)', false, 0, false, 0, false],
    ],
    count: 6,
    timings: {
      compiler: 0,
      execute: 72733,
      count: 0,
    },
  }
}
