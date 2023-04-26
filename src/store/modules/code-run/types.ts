export interface RecordsType {
  rows: [][]
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
  dimensionsAndXName: [DimensionType[], string]
  key: number
  type: string
}

export interface DimensionType {
  name: string
}

export interface SeriesType {
  name: string
  type: string
  smooth: boolean
  encode: {}
  symbolSize: number
  datasetIndex?: number
}
