import { PluginLoader, PluginModuleResource, dynamicImportPluginLoader } from '@perses-dev/plugin-system'
import { buildDefaultTraceLink } from '../traceLink'
import {
  EmbeddedSnapshotLogQuery,
  EmbeddedSnapshotTimeSeriesQuery,
  EmbeddedSnapshotTraceQuery,
  getEmbeddedSnapshotPluginModule,
} from '../snapshot/plugins/embeddedSnapshotPlugins'

const embeddedSnapshotPluginModule = {
  EmbeddedSnapshotTimeSeriesQuery,
  EmbeddedSnapshotLogQuery,
  EmbeddedSnapshotTraceQuery,
}

const bundledPluginLoader: PluginLoader = dynamicImportPluginLoader([
  // === Datasource / Query Plugins ===
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/prometheus-plugin', version: '0.57.1' },
      spec: {
        plugins: [
          { kind: 'Datasource', spec: { name: 'PrometheusDatasource', display: { name: 'Prometheus Datasource' } } },
          {
            kind: 'TimeSeriesQuery',
            spec: { name: 'PrometheusTimeSeriesQuery', display: { name: 'Prometheus Time Series Query' } },
          },
          {
            kind: 'Variable',
            spec: { name: 'PrometheusLabelValuesVariable', display: { name: 'Prometheus Label Values Variable' } },
          },
          {
            kind: 'Variable',
            spec: { name: 'PrometheusLabelNamesVariable', display: { name: 'Prometheus Label Names Variable' } },
          },
          {
            kind: 'Variable',
            spec: { name: 'PrometheusPromQLVariable', display: { name: 'Prometheus PromQL Variable' } },
          },
          { kind: 'Explore', spec: { name: 'PrometheusExplorer', display: { name: 'Prometheus Explorer' } } },
        ],
      },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/prometheus-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/greptimedb-plugin', version: '0.1.0-beta.0' },
      spec: {
        plugins: [
          { kind: 'Datasource', spec: { name: 'GreptimeDBDatasource', display: { name: 'GreptimeDB Datasource' } } },
          {
            kind: 'TimeSeriesQuery',
            spec: { name: 'GreptimeDBTimeSeriesQuery', display: { name: 'GreptimeDB Time Series Query' } },
          },
          { kind: 'LogQuery', spec: { name: 'GreptimeDBLogQuery', display: { name: 'GreptimeDB Log Query' } } },
          { kind: 'TraceQuery', spec: { name: 'GreptimeDBTraceQuery', display: { name: 'GreptimeDB Trace Query' } } },
        ],
      },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/greptimedb-plugin'),
  },

  // === Panel Plugins (existing) ===
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/timeseries-chart-plugin', version: '0.12.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'TimeSeriesChart', display: { name: 'Time Series Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/timeseries-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/gauge-chart-plugin', version: '0.12.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'GaugeChart', display: { name: 'Gauge Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/gauge-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/stat-chart-plugin', version: '0.12.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'StatChart', display: { name: 'Stat Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/stat-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/table-plugin', version: '0.11.2' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'Table', display: { name: 'Table' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/table-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/tracing-gantt-chart-plugin', version: '0.12.1' },
      spec: {
        plugins: [{ kind: 'Panel', spec: { name: 'TracingGanttChart', display: { name: 'Tracing Gantt Chart' } } }],
      },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/tracing-gantt-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/logs-table-plugin', version: '0.2.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'LogsTable', display: { name: 'Logs Table' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/logs-table-plugin'),
  },

  // TraceTable with default trace link patch
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/trace-table-plugin', version: '0.10.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'TraceTable', display: { name: 'Trace Table' } } }] },
    } as PluginModuleResource,
    importPlugin: async () => {
      const plugin = await import('@perses-dev/trace-table-plugin')
      const traceLink = buildDefaultTraceLink()
      return {
        ...plugin,
        TraceTable: {
          ...(plugin as any).TraceTable,
          createInitialOptions: () => {
            const baseOptions = (plugin as any).TraceTable?.createInitialOptions?.() || {}
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
    },
  },

  // === Panel Plugins (newly added) ===
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/histogram-chart-plugin', version: '0.11.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'HistogramChart', display: { name: 'Histogram Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/histogram-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/heatmap-chart-plugin', version: '0.4.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'HeatMapChart', display: { name: 'HeatMap Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/heatmap-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/markdown-plugin', version: '0.11.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'Markdown', display: { name: 'Markdown' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/markdown-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/scatter-chart-plugin', version: '0.10.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'ScatterChart', display: { name: 'Scatter Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/scatter-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/bar-chart-plugin', version: '0.11.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'BarChart', display: { name: 'Bar Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/bar-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/pie-chart-plugin', version: '0.13.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'PieChart', display: { name: 'Pie Chart' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/pie-chart-plugin'),
  },
  {
    resource: {
      kind: 'PluginModule',
      metadata: { name: '@perses-dev/timeseries-table-plugin', version: '0.11.1' },
      spec: { plugins: [{ kind: 'Panel', spec: { name: 'TimeSeriesTable', display: { name: 'Time Series Table' } } }] },
    } as PluginModuleResource,
    importPlugin: () => import('@perses-dev/timeseries-table-plugin'),
  },

  // === Embedded Snapshot Plugin (local) ===
  {
    resource: getEmbeddedSnapshotPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(embeddedSnapshotPluginModule),
  },
])

export default bundledPluginLoader
