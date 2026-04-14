import * as gaugeChartPlugin from '@perses-dev/gauge-chart-plugin'
import * as prometheusPlugin from '@perses-dev/prometheus-plugin'
import * as statChartPlugin from '@perses-dev/stat-chart-plugin'
import * as tablePlugin from '@perses-dev/table-plugin'
import * as timeseriesChartPlugin from '@perses-dev/timeseries-chart-plugin'
import * as greptimedbPlugin from '@perses-dev/greptimedb-plugin'
import { PluginLoader, PluginModuleResource, dynamicImportPluginLoader } from '@perses-dev/plugin-system'

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
    resource: statChartPlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(statChartPlugin),
  },
  {
    resource: tablePlugin.getPluginModule() as PluginModuleResource,
    importPlugin: () => Promise.resolve(tablePlugin),
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
