export interface tableState {
  columns: Array<any>
  tableList: Array<any>
  count: number
}

export interface TreeChild {
  key: string | number
  title: string
  isLeaf?: boolean
  dataType?: string
  iconType?: string
  parentKey?: number
}

export interface TreeData {
  key: string | number
  title: string
  children?: TreeChild[]
  isLeaf?: boolean
  dataType?: string
  iconType?: string
  code?: string
  timeIndexName?: string
}
