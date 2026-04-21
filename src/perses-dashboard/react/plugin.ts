import * as gaugeChartPlugin from '@perses-dev/gauge-chart-plugin'
import * as logsTablePlugin from '@perses-dev/logs-table-plugin'
import * as prometheusPlugin from '@perses-dev/prometheus-plugin'
import * as statChartPlugin from '@perses-dev/stat-chart-plugin'
import * as tablePlugin from '@perses-dev/table-plugin'
import * as tracingGanttChartPlugin from '@perses-dev/tracing-gantt-chart-plugin'
import * as traceTablePlugin from '@perses-dev/trace-table-plugin'
import * as timeseriesChartPlugin from '@perses-dev/timeseries-chart-plugin'
import * as greptimedbPlugin from '@perses-dev/greptimedb-plugin'
import { PluginLoader, PluginModuleResource, dynamicImportPluginLoader } from '@perses-dev/plugin-system'
import { buildDefaultTraceLink } from '../traceLink'

const patchedTraceTablePlugin = {
  ...traceTablePlugin,
  TraceTable: {
    ...(traceTablePlugin as any).TraceTable,
    createInitialOptions: () => {
      const baseOptions = (traceTablePlugin as any).TraceTable?.createInitialOptions?.() || {}
      const traceLink = buildDefaultTraceLink()
      return {
        ...baseOptions,
        links: {
          ...(baseOptions.links || {}),
          trace: baseOptions.links?.trace || traceLink,
        },
      }
    },
  },
}

const bundledPluginLoader: PluginLoader = dynamicImportPluginLoader([
  {
    resource: prometheusPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(prometheusPlugin),
  },
  {
    resource: gaugeChartPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(gaugeChartPlugin),
  },
  {
    resource: logsTablePlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(logsTablePlugin),
  },
  {
    resource: statChartPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(statChartPlugin),
  },
  {
    resource: tablePlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(tablePlugin),
  },
  {
    resource: traceTablePlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(patchedTraceTablePlugin as any),
  },
  {
    resource: tracingGanttChartPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(tracingGanttChartPlugin),
  },
  {
    resource: timeseriesChartPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(timeseriesChartPlugin),
  },
  {
    resource: greptimedbPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(greptimedbPlugin),
  },
])

export default bundledPluginLoader
