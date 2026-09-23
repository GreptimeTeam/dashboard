import { onMounted, watch } from 'vue'
import {
  loadDrilldownSettings,
  updateLogsDrilldownSettings,
  type LogsFieldMapSettings,
} from '@/observability/drilldown-settings'
import { buildLogsFieldMap, otelLogsFieldDefaultsFromColumns } from '@/observability/logs/field-map'
import { bindSignalTable } from '@/observability/bind-signal-table'
import {
  resolveEntityFilterRef,
  logsServiceFilterCandidateKeys,
  normalizeEntityFilters,
  resolveSignalTable,
  entityColumnFilterKey,
} from '@/observability/semantics'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from './context'

export default function useDrilldownLogsInit(ctx: DrilldownContext) {
  const tableSchemaStore = useTableSchemaStore()

  const restoreLogsDetailSelection = () => {
    if (ctx.logsView.value !== 'detail') {
      return
    }
    if (ctx.logsSelectedGroup.value) {
      return
    }
    const chipKeys = logsServiceFilterCandidateKeys(ctx.fieldMap.value.logs, ctx.entityFilterKeys.value.logs?.service)
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
    const database = ctx.logsDatabase.value
    const current = loadDrilldownSettings(database).logs
    try {
      const columns = await tableSchemaStore.ensureTableSchema(tableName, database)
      const reference = await resolveEntityFilterRef(tableName, 'service', {
        signal: 'logs',
        columns,
        database,
      })
      const serviceColumn = reference ? entityColumnFilterKey(reference) : undefined
      const next: LogsFieldMapSettings = {
        ...otelLogsFieldDefaultsFromColumns(columns, { serviceColumn }),
        ...(current.fieldMap ?? {}),
      }
      if (!next.primaryGroupBy && next.service) {
        next.primaryGroupBy = next.service
      }

      if (current.table?.trim() !== tableName || fieldMapKey(current.fieldMap) !== fieldMapKey(next)) {
        updateLogsDrilldownSettings({ table: tableName, fieldMap: next }, database)
      }
      return next
    } catch (error) {
      console.error(`Failed to seed logs field settings for ${tableName}:`, error)
      return current.fieldMap
    }
  }

  /**
   * Publish the bound table's service identity for cross-signal filters. The key may
   * be a JSON chip (`resource_attributes.service.name`) — filters support chips even
   * though the logs *roles* do not yet.
   */
  const publishEntityFilterKey = async (tableName: string) => {
    await bindSignalTable(ctx, 'logs', tableName)
    // A signal switch that happened before this table was bound could only fall back to
    // the `service` role; re-encode now that the real key (possibly a JSON chip) is known.
    ctx.setFilters(
      normalizeEntityFilters(ctx.filters.value, 'logs', (entity) => ctx.entityFilterKeys.value.logs?.[entity])
    )
  }

  /** Only bump shared refresh when logs panels are active — avoid re-querying metrics cards. */
  const refreshLogsPanelsIfActive = () => {
    if (ctx.signal.value === 'logs') {
      ctx.triggerRefresh()
    }
  }

  const applyTableAndFieldMap = async (tableName: string) => {
    const database = ctx.logsDatabase.value
    const fieldMap = await seedFieldSettings(tableName)
    const nextLogsFieldMap = await buildLogsFieldMap(tableName, fieldMap, database)
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.logsTable.value = tableName
    await publishEntityFilterKey(tableName)
    restoreLogsDetailSelection()
    // Detail may have mounted from URL before fieldMap was ready — reload panels.
    refreshLogsPanelsIfActive()
  }

  const initializeLogsContext = async () => {
    const database = ctx.logsDatabase.value
    const settings = loadDrilldownSettings(database).logs

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
        logs: await buildLogsFieldMap(tableName, fieldMap, database),
      }
      await publishEntityFilterKey(tableName)
      restoreLogsDetailSelection()
      // URL restore opens detail before this finishes; bump so table/chart reload.
      refreshLogsPanelsIfActive()
      return
    }

    const tableName = await resolveSignalTable('logs', {
      settingsTable: settings.table,
      database,
    })
    if (!tableName) {
      return
    }

    await applyTableAndFieldMap(tableName)
  }

  const resetLogsBinding = () => {
    ctx.logsTable.value = undefined
    ctx.setEntityFilterKey('logs', 'service', undefined)
    ctx.setSignalColumns('logs', undefined)
    ctx.setSignalColumnTypes('logs', undefined)
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: {},
    }
  }

  onMounted(() => {
    initializeLogsContext()
  })

  watch(
    () => ctx.logsDatabase.value,
    () => {
      resetLogsBinding()
      initializeLogsContext()
    }
  )

  return {
    initializeLogsContext,
    applyTableAndFieldMap,
  }
}
