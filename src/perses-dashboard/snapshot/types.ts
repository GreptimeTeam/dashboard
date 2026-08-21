import type { DashboardResource, TimeSeriesData, TraceData } from '@perses-dev/core'
import type { LogQueryResult } from '@perses-dev/plugin-system'
import type { SnapshotTimeRangeInput } from './resolveSnapshotTimeRange'

export const SNAPSHOT_VERSION = 1

export const EMBEDDED_SNAPSHOT_TIME_SERIES_KIND = 'EmbeddedSnapshotTimeSeriesQuery'
export const EMBEDDED_SNAPSHOT_LOG_KIND = 'EmbeddedSnapshotLogQuery'
export const EMBEDDED_SNAPSHOT_TRACE_KIND = 'EmbeddedSnapshotTraceQuery'

export const SNAPSHOT_QUERY_KIND_MAP: Record<string, string> = {
  GreptimeDBTimeSeriesQuery: EMBEDDED_SNAPSHOT_TIME_SERIES_KIND,
  PrometheusTimeSeriesQuery: EMBEDDED_SNAPSHOT_TIME_SERIES_KIND,
  GreptimeDBLogQuery: EMBEDDED_SNAPSHOT_LOG_KIND,
  GreptimeDBTraceQuery: EMBEDDED_SNAPSHOT_TRACE_KIND,
}

export const LIVE_QUERY_KINDS = new Set(Object.keys(SNAPSHOT_QUERY_KIND_MAP))

export type SnapshotQueryCategory = 'TimeSeriesQuery' | 'LogQuery' | 'TraceQuery'

export const QUERY_KIND_TO_CATEGORY: Record<string, SnapshotQueryCategory> = {
  GreptimeDBTimeSeriesQuery: 'TimeSeriesQuery',
  PrometheusTimeSeriesQuery: 'TimeSeriesQuery',
  GreptimeDBLogQuery: 'LogQuery',
  GreptimeDBTraceQuery: 'TraceQuery',
}

export type NormalizedQueryData = TimeSeriesData | LogQueryResult | TraceData

export interface PanelQueryResult {
  queryKind: string
  normalized?: NormalizedQueryData
  skipped?: boolean
  reason?: 'not_loaded' | 'query_error' | 'unsupported_query_kind'
  error?: string
}

export interface SnapshotOriginalPlugin {
  kind: string
  spec: Record<string, unknown>
}

export interface SnapshotEmbed {
  version: typeof SNAPSHOT_VERSION
  capturedAt: string
  sourceDashboard?: string
  timeRange: SnapshotTimeRangeInput
  variables: Record<string, string | string[]>
  panelData: Record<string, PanelQueryResult[]>
}

export interface SnapshotDashboardSpec {
  snapshot?: SnapshotEmbed
  [key: string]: unknown
}

export type SnapshotDashboardResource = DashboardResource & {
  spec: DashboardResource['spec'] & SnapshotDashboardSpec
}

export interface EmbeddedSnapshotQuerySpec {
  panelId: string
  queryIndex: number
  originalPlugin?: SnapshotOriginalPlugin
  [key: string]: unknown
}

export interface SkippedPanelInfo {
  panelId: string
  panelName?: string
  queryIndex: number
  queryKind: string
  reason: PanelQueryResult['reason']
  error?: string
}

export interface SnapshotCollectDebugInfo {
  totalCacheQueries: number
  activeTimeRange: { from: number; to: number }
  persesQueryEntries: Array<{
    category: string
    status: string
    hasData: boolean
    pluginKind: string
    fingerprint: string
    queryPreview?: string
    matchesActiveTimeRange?: boolean
    timeRange?: { from: number; to: number }
  }>
  otherCacheKeySamples: Array<{
    head: unknown
    status: string
    hasData: boolean
  }>
  panelLookups: Array<{
    panelId: string
    queryIndex: number
    queryKind: string
    fingerprint: string
    matched: boolean
  }>
}

export interface BuildSnapshotResult {
  dashboard: SnapshotDashboardResource
  skipped: SkippedPanelInfo[]
  debug?: SnapshotCollectDebugInfo
}
