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
  children?: TreeChild[]
}

export interface TableTreeChild extends TreeChild {
  key: string
  dataType: string
  iconType: string
  parentKey: number
}

export interface TableTreeParent extends TreeData {
  key: number
  code: string
  timeIndexName: string
}

export interface ScriptTreeData extends TreeData {
  code: string
}
