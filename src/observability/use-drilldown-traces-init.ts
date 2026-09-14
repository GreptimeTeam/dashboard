import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
import { resolveTracesTable } from '@/observability/traces/resolve-table'
import type { DrilldownContext } from './context'

export default function useDrilldownTracesInit(ctx: DrilldownContext) {
  const { database } = storeToRefs(useAppStore())

  const applyTableAndFieldMap = (tableName: string) => {
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: buildDefaultTracesFieldMap(),
    }
    ctx.tracesTable.value = tableName
    ctx.triggerRefresh()
  }

  const initializeTracesContext = async () => {
    if (ctx.tracesTable.value) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        traces: buildDefaultTracesFieldMap(),
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
    ctx.focusTraceId.value = undefined
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
