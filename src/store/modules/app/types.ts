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
  databaseURL: string
  [key: string]: unknown
  codeType: string
}
