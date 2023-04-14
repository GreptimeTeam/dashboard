export interface RecordsType {
  rows: any[]
  schema: { column_schemas: any[] }
}

export interface ResultType {
  records: RecordsType
  dimensionsAndXName: any[]
  key: number
  type: string
}

export interface CodeRunType {
  log: any
  record?: any
}
