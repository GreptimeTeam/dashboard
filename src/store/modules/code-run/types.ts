export interface RecordsType {
  rows: any[]
  schema: { column_schemas: SchemaType[] }
}

export interface SchemaType {
  name: string
  data_type: string
}

export interface OutputType {
  records?: RecordsType
  affectedrows?: any
}

export interface ResultType {
  records: RecordsType
  dimensionsAndXName: any[]
  key: number
  type: string
}

export interface DimensionType {
  name: string
}
