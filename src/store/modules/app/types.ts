import type { RouteRecordNormalized } from 'vue-router'

export type DbConnectionStatus = 'unknown' | 'connecting' | 'connected' | 'disconnected'

export interface ConnectionConfig {
  host: string
  database: string
  username: string
  password: string
  authHeader: string
  userTimezone: string
}

export interface CloudContext {
  dbId?: string
  lifetime?: string
  serviceName?: string
  regionVendor?: string
  regionLocation?: string
  regionCountry?: string
}

export type StoredConfig = ConnectionConfig & CloudContext

export interface UiConfig {
  theme: string
  navbar: boolean
  hideMenu: boolean
  menuCollapse: boolean
  footer: boolean
  menuWidth: number
  device: string
  hideSidebar: boolean
  locale?: string
  compactRows?: boolean
  querySidebarWidth?: number
  metricsSidebarWidth?: number
  persesSidebarWidth?: number
  drilldownMetricsSidebarWidth?: number
  queryEditorHeight?: number
  logQueryChartExpanded?: boolean
  traceChartExpanded?: boolean
  persesSkillAlertDismissed?: boolean
  logsTableSingleColumn?: boolean
  logsTableShowKeys?: boolean
  logsTableCompactRows?: boolean
  logsTableWrapLines?: boolean
  /**
   * Ordered visible column names (allowlist). Missing = never configured (show all).
   * `[]` = all hidden for configured tables. Legacy hidden/order keys are migrated away.
   */
  logsTableColumns?: string[]
  traceTableColumns?: string[]
  /** @deprecated Migrated into logsTableColumns */
  logsTableHiddenColumns?: string[]
  /** @deprecated Migrated into logsTableColumns */
  logsTableColumnOrder?: string[]
  /** @deprecated Migrated into traceTableColumns */
  traceTableHiddenColumns?: string[]
  /** @deprecated Migrated into traceTableColumns */
  traceTableColumnOrder?: string[]
}

export interface AppState extends StoredConfig, UiConfig {
  dbId: string
  lifetime: string
  serviceName: string
  regionVendor: string
  regionLocation: string
  regionCountry: string
  menu: boolean
  globalSettings: boolean
  tabBar: boolean
  databaseList: Array<string>
  guideModalVisible: boolean
  [key: string]: unknown
}
