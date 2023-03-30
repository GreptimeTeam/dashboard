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
