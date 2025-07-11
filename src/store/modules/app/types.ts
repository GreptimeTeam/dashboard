import type { RouteRecordNormalized } from 'vue-router'

export interface AppState {
  theme: string
  navbar: boolean
  menu: boolean
  hideMenu: boolean
  menuCollapse: boolean
  footer: boolean
  menuWidth: number
  globalSettings: boolean
  device: string
  tabBar: boolean
  host: string
  database: string
  databaseList: Array<string>
  guideModalVisible: boolean
  username: string
  password: string
  dbId: string
  lifetime: string
  menuSelectedKey: string
  userTimezone: string
  isFullScreen: boolean
  authHeader: string
  [key: string]: unknown
}
