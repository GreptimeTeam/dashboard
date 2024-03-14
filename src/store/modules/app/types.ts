import type { RouteRecordNormalized } from 'vue-router'
import { AppRouteRecordRaw } from '@/router/routes/types'
import { Component } from 'vue'
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
  guideModalVisible: boolean
  username: string
  password: string
  dbId: string
  lifetime: string
  menuSelectedKey: string
  queryModalVisible: boolean
  userTimezone: string
  statusBar: Record<string, Array<StatusItem>>
  statusBarLeft: Record<string, Array<StatusItem>>
  [key: string]: unknown
}

export interface StatusItemSimple {
  text?: string
  icon?: Component | string
  onClick?: (item: any, evt: PointerEvent) => void
}
export type StatusItem = StatusItemSimple | Component
