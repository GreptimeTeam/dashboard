import { onMounted, watch } from 'vue'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
import { bindSignalTable } from '@/observability/bind-signal-table'
import { normalizeEntityFilters, physicalServiceColumn, resolveSignalTable } from '@/observability/semantics'
import type { DrilldownContext } from './context'

export default function useDrilldownTracesInit(ctx: DrilldownContext) {
  /**
   * Declared service identity when the table has one; the v1 model column otherwise.
   * Binding also publishes the entity key and physical columns for cross-signal filters.
   */
  const tracesFieldMapFor = async (tableName: string) => {
    const { serviceRef } = await bindSignalTable(ctx, 'traces', tableName)
    // A URL restore that happened before this table was bound kept the shared filter's
    // raw key (e.g. a logs chip); re-encode now that the real key is known.
    ctx.setFilters(
      normalizeEntityFilters(ctx.filters.value, 'traces', (entity) => ctx.entityFilterKeys.value.traces?.[entity])
    )
    return buildDefaultTracesFieldMap({ serviceColumn: physicalServiceColumn(serviceRef) })
  }

  /**
   * Setting the table drives every consumer watch (home rows, RED panels, breakdown
   * grid) — an extra triggerRefresh here would re-run the same queries a second time.
   */
  const applyTableAndFieldMap = async (tableName: string) => {
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: await tracesFieldMapFor(tableName),
    }
    ctx.tracesTable.value = tableName
  }

  const initializeTracesContext = async () => {
    const database = ctx.tracesDatabase.value
    if (ctx.tracesTable.value) {
      const tableName = ctx.tracesTable.value
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        traces: await tracesFieldMapFor(tableName),
      }
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
