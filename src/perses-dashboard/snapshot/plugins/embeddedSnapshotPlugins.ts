import type { TimeSeriesData, TraceData } from '@perses-dev/core'
import type { LogQueryResult } from '@perses-dev/plugin-system'
import { getSnapshotPanelData } from './snapshotEmbedStore'
import createEmbeddedSnapshotQueryEditor from './embeddedSnapshotQueryEditor'

const EMPTY_TIME_SERIES: TimeSeriesData = { series: [] }
const EMPTY_TRACE_DATA: TraceData = { searchResult: [] }
const EMPTY_LOG_DATA: LogQueryResult = {
  logs: { entries: [] },
  timeRange: { start: new Date(0), end: new Date(0) },
}

/** Embedded data does not interpolate variables — keep query keys stable when builtins load. */
const EMPTY_VARIABLE_DEPENDENCIES = () => ({ variables: [] as string[] })

export const EmbeddedSnapshotTimeSeriesQuery = {
  getTimeSeriesData: async (spec: { panelId: string; queryIndex: number }): Promise<TimeSeriesData> => {
    try {
      const data = getSnapshotPanelData(spec)
      return (data as TimeSeriesData | undefined) ?? EMPTY_TIME_SERIES
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[snapshot] failed to read embedded time series data', spec, error)
      return EMPTY_TIME_SERIES
    }
  },
  dependsOn: EMPTY_VARIABLE_DEPENDENCIES,
  OptionsEditorComponent: createEmbeddedSnapshotQueryEditor('TimeSeriesQuery'),
  createInitialOptions: () => ({ panelId: '', queryIndex: 0 }),
}

export const EmbeddedSnapshotLogQuery = {
  getLogData: async (spec: { panelId: string; queryIndex: number }): Promise<LogQueryResult> => {
    const data = getSnapshotPanelData(spec)
    return (data as LogQueryResult | undefined) ?? EMPTY_LOG_DATA
  },
  dependsOn: EMPTY_VARIABLE_DEPENDENCIES,
  OptionsEditorComponent: createEmbeddedSnapshotQueryEditor('LogQuery'),
  createInitialOptions: () => ({ panelId: '', queryIndex: 0 }),
}

export const EmbeddedSnapshotTraceQuery = {
  getTraceData: async (spec: { panelId: string; queryIndex: number }): Promise<TraceData> => {
    const data = getSnapshotPanelData(spec)
    return (data as TraceData | undefined) ?? EMPTY_TRACE_DATA
  },
  dependsOn: EMPTY_VARIABLE_DEPENDENCIES,
  OptionsEditorComponent: createEmbeddedSnapshotQueryEditor('TraceQuery'),
  createInitialOptions: () => ({ panelId: '', queryIndex: 0 }),
}

export function getEmbeddedSnapshotPluginModule() {
  return {
    kind: 'PluginModule' as const,
    metadata: {
      name: '@greptime/embedded-snapshot-plugin',
      version: '1.0.0',
    },
    spec: {
      plugins: [
        {
          kind: 'TimeSeriesQuery' as const,
          spec: {
            name: 'EmbeddedSnapshotTimeSeriesQuery',
            display: { name: 'Embedded Snapshot Time Series' },
          },
        },
        {
          kind: 'LogQuery' as const,
          spec: {
            name: 'EmbeddedSnapshotLogQuery',
            display: { name: 'Embedded Snapshot Log' },
          },
        },
        {
          kind: 'TraceQuery' as const,
          spec: {
            name: 'EmbeddedSnapshotTraceQuery',
            display: { name: 'Embedded Snapshot Trace' },
          },
        },
      ],
    },
  }
}
