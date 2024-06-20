export interface tableState {
  columns: Array<any>
  tableList: Array<any>
  count: number
}

export interface TreeChild {
  key: string | number
  title: string
  isLeaf?: boolean
}

export interface TreeData extends TreeChild {
  children: TreeChild[]
}

export interface TableTreeChild extends TreeChild {
  key: string
  dataType: string
  iconType: string
  parentKey: number
}

export interface TableDetail extends TreeChild {
  key: string
  parentKey: number
  tableName: string
  info: any
  class: string
}

export interface TableTreeParent extends TreeData {
  key: number
  childrenType: 'columns' | 'details'
  timeIndexName: string
  children: TableTreeChild[] | TableDetail[]
  columns: TableTreeChild[]
  details: TableDetail[]
  tableType?: string
}

export interface ScriptTreeData extends TreeData {
  code: string
}
