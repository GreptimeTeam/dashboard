import { onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'
import {
  loadDrilldownSettings,
  updateLogsDrilldownSettings,
  type LogsFieldMapSettings,
} from '@/observability/drilldown-settings'
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

  const FIELD_ROLES = ['time', 'body', 'severity', 'service', 'primaryGroupBy', 'traceId'] as const

  /** Order-independent identity of a field map, used to skip redundant writes. */
  const fieldMapKey = (map?: LogsFieldMapSettings) =>
    FIELD_ROLES.map((role) => `${role}=${map?.[role] ?? ''}`).join('|')

  /**
   * Field settings for the bound table, filled in on entering logs — not when the settings
   * modal opens, so the modal (and every role consumer) already has values.
   *
   * Semantics seed the defaults: the OTEL logs model for time/body/severity/traceId, and the
   * entity resolution for service — a real column or the JSON chip
   * (`resource_attributes.service.name`). Saved values win; only gaps are filled, so a role
   * the user configured is never overwritten. The bound table is persisted too, because the
   * modal hydrates its column list from it.
   */
  const seedFieldSettings = async (tableName: string) => {
    const current = loadDrilldownSettings(database.value).logs
    try {
      const columns = await tableSchemaStore.ensureTableSchema(tableName)
      const reference = await resolveEntityFilterRef(tableName, 'service', { signal: 'logs', columns })
      const serviceColumn = reference ? entityColumnFilterKey(reference) : undefined
      const next: LogsFieldMapSettings = {
        ...otelLogsFieldDefaultsFromColumns(columns, { serviceColumn }),
        ...(current.fieldMap ?? {}),
      }
      if (!next.primaryGroupBy && next.service) {
        next.primaryGroupBy = next.service
      }

      if (current.table?.trim() !== tableName || fieldMapKey(current.fieldMap) !== fieldMapKey(next)) {
        updateLogsDrilldownSettings({ table: tableName, fieldMap: next }, database.value)
      }
      return next
    } catch (error) {
      console.error(`Failed to seed logs field settings for ${tableName}:`, error)
      return current.fieldMap
    }
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
      ctx.setSignalColumns(
        'logs',
        columns.map((column) => column.name)
      )
      // Typed filter literals (numeric comparisons, TRUE/FALSE) read these data types.
      ctx.setSignalColumnTypes(
        'logs',
        Object.fromEntries(columns.map((column) => [column.name, column.data_type || '']))
      )
      // A signal switch that happened before this table was bound could only fall back to
      // the `service` role; re-encode now that the real key (possibly a JSON chip) is known.
      ctx.setFilters(
        normalizeEntityFilters(ctx.filters.value, 'logs', (entity) => ctx.entityFilterKeys.value.logs?.[entity])
      )
    } catch (error) {
      console.error(`Failed to resolve the service filter key for ${tableName}:`, error)
      ctx.setEntityFilterKey('logs', 'service', undefined)
      ctx.setSignalColumnTypes('logs', undefined)
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
    ctx.setSignalColumns('logs', undefined)
    ctx.setSignalColumnTypes('logs', undefined)
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
