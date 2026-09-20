import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
import { resolveTracesTable } from '@/observability/traces/resolve-table'
import resolveTracesServiceColumn from '@/observability/traces/service-column'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from './context'

export default function useDrilldownTracesInit(ctx: DrilldownContext) {
  const { database } = storeToRefs(useAppStore())
  const tableSchemaStore = useTableSchemaStore()

  /** Declared service identity when the table has one; the v1 model column otherwise. */
  const tracesFieldMapFor = async (tableName: string) => {
    const serviceColumn = await resolveTracesServiceColumn(tableName)
    // Publish it so a service filter set on another signal lands on this table's column.
    ctx.setEntityFilterKey('traces', 'service', serviceColumn)
    try {
      const columns = await tableSchemaStore.ensureTableSchema(tableName)
      ctx.setSignalColumns('traces', columns.map((column) => column.name))
    } catch (error) {
      console.error(`Failed to load columns for ${tableName}:`, error)
      ctx.setSignalColumns('traces', undefined)
    }
    return buildDefaultTracesFieldMap({ serviceColumn })
  }

  const applyTableAndFieldMap = async (tableName: string) => {
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: await tracesFieldMapFor(tableName),
    }
    ctx.tracesTable.value = tableName
    ctx.triggerRefresh()
  }

  const initializeTracesContext = async () => {
    if (ctx.tracesTable.value) {
      const tableName = ctx.tracesTable.value
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        traces: await tracesFieldMapFor(tableName),
      }
      ctx.triggerRefresh()
      return
    }

    const settings = loadDrilldownSettings(database.value).traces
    const tableName = await resolveTracesTable({ settingsTable: settings?.table })
    if (!tableName) {
      return
    }
    applyTableAndFieldMap(tableName)
  }

  onMounted(() => {
    initializeTracesContext()
  })

  watch(database, () => {
    ctx.tracesTable.value = undefined
    ctx.setEntityFilterKey('traces', 'service', undefined)
    ctx.setSignalColumns('traces', undefined)
    ctx.focusTraceId.value = undefined
    ctx.logsTraceId.value = undefined
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: {},
    }
    initializeTracesContext()
  })

  return {
    initializeTracesContext,
    applyTableAndFieldMap,
  }
}
