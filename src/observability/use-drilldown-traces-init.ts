import { onMounted, watch } from 'vue'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
import { bindSignalTable } from '@/observability/bind-signal-table'
import { physicalServiceColumn, resolveSignalTable } from '@/observability/semantics'
import type { DrilldownContext } from './context'

export default function useDrilldownTracesInit(ctx: DrilldownContext) {
  /**
   * Declared service identity when the table has one; the v1 model column otherwise.
   * Binding also publishes the entity key and physical columns for cross-signal filters.
   */
  const tracesFieldMapFor = async (tableName: string) => {
    const { serviceRef } = await bindSignalTable(ctx, 'traces', tableName)
    return buildDefaultTracesFieldMap({ serviceColumn: physicalServiceColumn(serviceRef) })
  }

  /** Only bump shared refresh when traces panels are active — avoid re-querying metrics cards. */
  const refreshTracesPanelsIfActive = () => {
    if (ctx.signal.value === 'traces') {
      ctx.triggerRefresh()
    }
  }

  const applyTableAndFieldMap = async (tableName: string) => {
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: await tracesFieldMapFor(tableName),
    }
    ctx.tracesTable.value = tableName
    refreshTracesPanelsIfActive()
  }

  const initializeTracesContext = async () => {
    const database = ctx.tracesDatabase.value
    if (ctx.tracesTable.value) {
      const tableName = ctx.tracesTable.value
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        traces: await tracesFieldMapFor(tableName),
      }
      refreshTracesPanelsIfActive()
      return
    }

    const settings = loadDrilldownSettings(database).traces
    const tableName = await resolveSignalTable('traces', {
      settingsTable: settings?.table,
      database,
    })
    if (!tableName) {
      return
    }
    applyTableAndFieldMap(tableName)
  }

  const resetTracesBinding = () => {
    ctx.tracesTable.value = undefined
    ctx.setEntityFilterKey('traces', 'service', undefined)
    ctx.setSignalColumns('traces', undefined)
    ctx.setSignalColumnTypes('traces', undefined)
    ctx.focusTraceId.value = undefined
    ctx.logsTraceId.value = undefined
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: {},
    }
  }

  onMounted(() => {
    initializeTracesContext()
  })

  watch(
    () => ctx.tracesDatabase.value,
    () => {
      resetTracesBinding()
      initializeTracesContext()
    }
  )

  return {
    initializeTracesContext,
    applyTableAndFieldMap,
  }
}
