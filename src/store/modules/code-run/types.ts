export interface ResultType {
  records: RecordsType
  dimensionsAndXName: any[]
  key: number
}

export interface RecordsType {
  rows: any[]
  schema: { column_schemas: any[] }
}

export interface ResultsType {
  [key: string]: ResultType[]
}
