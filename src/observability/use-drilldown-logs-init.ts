import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'
import { loadDrilldownSettings, updateLogsDrilldownSettings } from '@/observability/drilldown-settings'
import { buildLogsFieldMap, otelLogsFieldDefaultsFromColumns } from '@/observability/logs/field-map'
import { resolveLogsTable } from '@/observability/logs/resolve-table'
import { entityColumnFilterKey, resolveEntityFilterRef } from '@/observability/entities'
import { normalizeEntityFilters } from '@/observability/entity-keys'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from './context'

export default function useDrilldownLogsInit(ctx: DrilldownContext) {
  const { database } = storeToRefs(useAppStore())
  const tableSchemaStore = useTableSchemaStore()

  const restoreLogsDetailSelection = () => {
    if (ctx.logsView.value !== 'detail') {
      return
    }
    if (ctx.logsSelectedGroup.value) {
      return
    }
    const groupCol = ctx.fieldMap.value.logs.primaryGroupBy
    const serviceChip = ctx.fieldMap.value.logs.service
    const chipKeys = new Set(
      [groupCol, serviceChip, ctx.entityFilterKeys.value.logs?.service, 'service', 'primaryGroupBy'].filter(
        Boolean
      ) as string[]
    )
    const match = ctx.filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
    if (match) {
      ctx.logsSelectedGroup.value = match.value
    }
  }

  const seedFieldSettings = async (tableName: string) => {
    const current = loadDrilldownSettings(database.value).logs
    if (current.fieldMap) {
      return current.fieldMap
    }
    try {
      const columns = await tableSchemaStore.ensureTableSchema(tableName)
      const reference = await resolveEntityFilterRef(tableName, 'service', { signal: 'logs', columns })
      // Chip-style identities need role-level JSON handling; only flat columns apply here.
      const serviceColumn = reference && !reference.jsonKey ? reference.column : undefined
      updateLogsDrilldownSettings(
        { fieldMap: otelLogsFieldDefaultsFromColumns(columns, { serviceColumn }) },
        database.value
      )
    } catch (error) {
      console.error(`Failed to seed logs field settings for ${tableName}:`, error)
      return undefined
    }
    return loadDrilldownSettings(database.value).logs.fieldMap
  }

  /**
   * Publish the bounded table's service identity for cross-signal filters. The key may
   * be a JSON chip (`resource_attributes.service.name`) — filters support chips even
   * though the logs *roles* do not yet.
   */
  const publishEntityFilterKey = async (tableName: string) => {
    try {
      const columns = await tableSchemaStore.ensureTableSchema(tableName)
      const reference = await resolveEntityFilterRef(tableName, 'service', { signal: 'logs', columns })
      ctx.setEntityFilterKey('logs', 'service', reference ? entityColumnFilterKey(reference) : undefined)
      // A signal switch that happened before this table was bound could only fall back to
      // the `service` role; re-encode now that the real key (possibly a JSON chip) is known.
      ctx.setFilters(
        normalizeEntityFilters(ctx.filters.value, 'logs', (entity) => ctx.entityFilterKeys.value.logs?.[entity])
      )
    } catch (error) {
      console.error(`Failed to resolve the service filter key for ${tableName}:`, error)
      ctx.setEntityFilterKey('logs', 'service', undefined)
    }
  }

  const applyTableAndFieldMap = async (tableName: string) => {
    const fieldMap = await seedFieldSettings(tableName)
    const nextLogsFieldMap = await buildLogsFieldMap(tableName, fieldMap)
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.logsTable.value = tableName
    await publishEntityFilterKey(tableName)
    restoreLogsDetailSelection()
    // Detail may have mounted from URL before fieldMap was ready — reload panels.
    ctx.triggerRefresh()
  }

  const initializeLogsContext = async () => {
    const settings = loadDrilldownSettings(database.value).logs

    const settingsTable = settings.table?.trim()
    if (settingsTable) {
      await applyTableAndFieldMap(settingsTable)
      return
    }

    if (ctx.logsTable.value) {
      const tableName = ctx.logsTable.value
      const fieldMap = await seedFieldSettings(tableName)
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: await buildLogsFieldMap(tableName, fieldMap),
      }
      await publishEntityFilterKey(tableName)
      restoreLogsDetailSelection()
      // URL restore opens detail before this finishes; bump so table/chart reload.
      ctx.triggerRefresh()
      return
    }

    const tableName = await resolveLogsTable()
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
    ctx.setEntityFilterKey('logs', 'service', undefined)
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
