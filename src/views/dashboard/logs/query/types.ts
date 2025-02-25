export type ColumnType = {
  name: string
  data_type: string
  label: string
  semantic_type: string
}

export type Condition = {
  field: ColumnType
  op: string
  value: string
  rel: 'and' | 'or'
}

export type TSColumn = ColumnType & {
  multiple: number
}
