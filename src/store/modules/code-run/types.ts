export interface resultType {
  records: recordsType
  dimensionsAndXName: any[]
  key: number
}

export interface recordsType {
  rows: any[]
  schema: { column_schemas: any[] }
}

export interface keyType {
  [key: string]: number
}

export interface resultsType {
  [key: string]: resultType[]
}
