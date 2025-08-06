export interface Condition {
  field: string
  operator: string
  value: string | number | boolean
  relation?: 'AND' | 'OR'
  isTimeColumn?: boolean
  fieldType?: string
}

export type TSColumn = {
  name: string
  data_type?: string
}

interface BaseState {
  table: string
  orderBy: 'DESC' | 'ASC'
  limit: number
  tsColumn: TSColumn // Use a more specific type if available
}

export interface TextEditorFormState extends BaseState {
  sql: string
}

export interface BuilderFormState extends BaseState {
  conditions: Condition[]
  orderByField: string
}

export type ColumnType = {
  name: string
  data_type: string
  title: string
  semantic_type?: string
}

export interface QueryState extends BaseState {
  editorType: 'builder' | 'text'
  timeRangeValues: any[]
  time: number
  rangeTime: any[]
  sourceState: TextEditorFormState | BuilderFormState
  sql: string
  generateSql: (queryState: TextEditorFormState | BuilderFormState, timeRange: any[]) => string
}
