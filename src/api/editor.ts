import axios from 'axios'

// todo: this next function is the same as the upper one
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

export function getFavoriteList() {
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
      [2, 'select 1', 'timestamp', 'NONE', 500000, '300000000', false],
      [121, 'select 2', 'time', 'DAY', 500000, '300000000', false],
      [4, 'select 3', 'timestamp', 'NONE', 500000, '300000000', false],
      [5, 'select 4', 'pickup_datetime', 'MONTH', 500000, '300000000', false],
      [10, 'select 5', 'timestamp', 'DAY', 500000, '2000000', false],
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
