import type { RouteRecordNormalized } from 'vue-router'

export interface AppState {
  theme: string
  colorWeak: boolean
  navbar: boolean
  menu: boolean
  hideMenu: boolean
  menuCollapse: boolean
  footer: boolean
  themeColor: string
  menuWidth: number
  globalSettings: boolean
  device: string
  tabBar: boolean
  menuFromServer: boolean
  serverMenu: RouteRecordNormalized[]
  database: string
  host: string
  databaseList: Array<string>
  codeType: string
  isCloud: boolean
  guideModalVisible: boolean
  username: string
  password: string
  dbId: string
  lifetime: string
  [key: string]: unknown
  queryModalVisible: boolean
}
