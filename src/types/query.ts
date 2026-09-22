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
  database?: string // Selected database name (optional for text editor)
}

export interface BuilderFormState extends BaseState {
  conditions: Condition[]
  orderByField: string
  database?: string // Selected database name
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
  /**
   * Absolute unix-seconds window frozen at Run. Scroll loadMore must keyset
   * inside this window and must not rewrite toolbar time.
   */
  frozenUnixRange?: readonly [number, number] | null
  sourceState: TextEditorFormState | BuilderFormState
  sql: string
  database?: string // Selected database name
  generateSql: (queryState: TextEditorFormState | BuilderFormState, timeRange: any[]) => string
}
