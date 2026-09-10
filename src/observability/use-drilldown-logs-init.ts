import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import { buildLogsFieldMap } from '@/observability/logs/field-map'
import { resolveLogsTable } from '@/observability/logs/resolve-table'
import type { DrilldownContext } from '../context'

export default function useDrilldownLogsInit(ctx: DrilldownContext) {
  const { database } = storeToRefs(useAppStore())

  const restoreLogsDetailSelection = () => {
    if (ctx.logsView.value !== 'detail') {
      return
    }
    if (ctx.logsSelectedGroup.value) {
      return
    }
    const groupCol = ctx.fieldMap.value.logs.primaryGroupBy
    const serviceChip = ctx.fieldMap.value.logs.service
    const chipKeys = new Set([groupCol, serviceChip, 'service', 'primaryGroupBy'].filter(Boolean) as string[])
    const match = ctx.filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
    if (match) {
      ctx.logsSelectedGroup.value = match.value
    }
  }

  const applyTableAndFieldMap = async (tableName: string) => {
    const settings = loadDrilldownSettings(database.value).logs
    const nextLogsFieldMap = await buildLogsFieldMap(tableName, settings.fieldMap)
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.logsTable.value = tableName
    restoreLogsDetailSelection()
  }

  const initializeLogsContext = async () => {
    const settings = loadDrilldownSettings(database.value).logs

    if (ctx.logsTable.value) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: await buildLogsFieldMap(ctx.logsTable.value, settings.fieldMap),
      }
      restoreLogsDetailSelection()
      return
    }

    const tableName = await resolveLogsTable({ settingsTable: settings.table })
    if (!tableName) {
      return
    }

    await applyTableAndFieldMap(tableName)
  }

  onMounted(() => {
    initializeLogsContext()
  })

  watch(database, () => {
    ctx.logsTable.value = undefined
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: {},
    }
    initializeLogsContext()
  })

  return {
    initializeLogsContext,
    applyTableAndFieldMap,
  }
}
