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
  databaseURL: string
  databaseList: Array<string>
  codeType: string
  isCloud: boolean
  settingsBtn: boolean
  guideModal: boolean
  principal: string
  credential: string
  [key: string]: unknown
}
