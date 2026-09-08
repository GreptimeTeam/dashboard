import { onMounted } from 'vue'
import { buildDefaultLogsFieldMap, resolveLogsTable } from '@/observability/logs/resolve-table'
import type { DrilldownContext } from '../context'

export default function useDrilldownLogsInit(ctx: DrilldownContext) {
  const initializeLogsContext = async () => {
    if (ctx.logsTable.value) {
      if (!Object.keys(ctx.fieldMap.value.logs).length) {
        ctx.fieldMap.value = {
          ...ctx.fieldMap.value,
          logs: await buildDefaultLogsFieldMap(ctx.logsTable.value),
        }
      }
      return
    }

    const tableName = await resolveLogsTable()
    if (!tableName) {
      return
    }

    ctx.logsTable.value = tableName
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: await buildDefaultLogsFieldMap(tableName),
    }
  }

  onMounted(() => {
    initializeLogsContext()
  })

  return {
    initializeLogsContext,
  }
}
