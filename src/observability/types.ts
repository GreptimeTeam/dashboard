export type DrilldownSignal = 'metrics' | 'logs' | 'traces'

/** Metric detail drawer tabs (URL `tab`, omit default `breakdown`). */
export type MetricDetailTab = 'breakdown' | 'related-logs' | 'related-metrics' | 'query-results'

export const METRIC_DETAIL_TABS: MetricDetailTab[] = ['breakdown', 'related-logs', 'related-metrics', 'query-results']

export function isMetricDetailTab(value: unknown): value is MetricDetailTab {
  return typeof value === 'string' && METRIC_DETAIL_TABS.includes(value as MetricDetailTab)
}

/** Logs detail drawer section tabs (URL `logsTab`, omit default `logs`). */
export type LogsDetailTab = 'logs' | 'labels' | 'fields'

export const LOGS_DETAIL_TABS: LogsDetailTab[] = ['logs', 'labels', 'fields']

export function isLogsDetailTab(value: unknown): value is LogsDetailTab {
  return typeof value === 'string' && LOGS_DETAIL_TABS.includes(value as LogsDetailTab)
}

/** Traces home panel tabs (URL `tracesTab`, omit default `breakdown`). */
export type TracesHomeTab = 'breakdown' | 'traces'

export const TRACES_HOME_TABS: TracesHomeTab[] = ['breakdown', 'traces']

export function isTracesHomeTab(value: unknown): value is TracesHomeTab {
  return typeof value === 'string' && TRACES_HOME_TABS.includes(value as TracesHomeTab)
}

export type LogsView = 'overview' | 'detail'

export function isLogsView(value: unknown): value is LogsView {
  return value === 'overview' || value === 'detail'
}

export type DrilldownFilterOp = '=' | '!=' | '=~' | '!~'

export interface DrilldownFilter {
  key: string
  op: DrilldownFilterOp
  value: string
}

export type DrilldownGroupBy = 'none' | '__name__' | string

export interface DrilldownSidebarFilters {
  prefixes: string[]
  suffixes: string[]
  groupBy: DrilldownGroupBy
}

export interface DrilldownFieldMap {
  logs: Record<string, string>
  traces: Record<string, string>
  metrics?: Record<string, string>
}

export interface DrilldownContextState {
  filters: DrilldownFilter[]
  sidebarFilters: DrilldownSidebarFilters
  metric?: string
  focusTraceId?: string
  logsTable?: string
  tracesTable?: string
  fieldMap: DrilldownFieldMap
}

export const DEFAULT_SIDEBAR_FILTERS: DrilldownSidebarFilters = {
  prefixes: [],
  suffixes: [],
  groupBy: 'none',
}

export const DEFAULT_FIELD_MAP: DrilldownFieldMap = {
  logs: {},
  traces: {},
  metrics: {},
}
