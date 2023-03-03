export interface tableState {
  columns: Array<any>
  tableList: Array<any>
  count: number
}

export interface TreeData {
  key: string | number
  title: string
  children?: Array<TreeData>
}
