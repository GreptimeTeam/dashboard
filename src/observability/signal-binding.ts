import { onMounted, watch } from 'vue'
import {
  loadDrilldownSettings,
  updateLogsDrilldownSettings,
  updateTracesDrilldownSettings,
  type LogsFieldMapSettings,
} from '@/observability/drilldown-settings'
import {
  buildLogsFieldMapFromColumns,
  isLogsRoleValue,
  otelLogsFieldDefaultsFromColumns,
  type SchemaColumn,
} from '@/observability/logs/field-map'
import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
import {
  entityColumnFilterKey,
  inspectSignalTable,
  physicalServiceColumn,
  resolveLogsDetailGroupFromFilters,
  resolveSignalTable,
} from '@/observability/semantics'
import type { DrilldownActions, DrilldownContext } from './context'

const FIELD_ROLES = ['time', 'body', 'severity', 'service', 'primaryGroupBy', 'traceId'] as const
type LogsRole = (typeof FIELD_ROLES)[number]

/** Order-independent identity of a field map, used to skip redundant settings writes. */
function fieldMapKey(map?: LogsFieldMapSettings) {
  return FIELD_ROLES.map((role) => `${role}=${map?.[role] ?? ''}`).join('|')
}

function asSchemaColumns(columns: Array<{ name: string; data_type?: string; semantic_type?: string }>): SchemaColumn[] {
  return columns.map((column) => ({
    name: column.name,
    data_type: column.data_type || '',
    semantic_type: column.semantic_type,
  }))
}

function rolesFromFieldMap(map: Record<string, string>): LogsFieldMapSettings {
  const next: LogsFieldMapSettings = {}
  FIELD_ROLES.forEach((role) => {
    const value = map[role]?.trim()
    if (value) {
      next[role] = value
    }
  })
  return next
}

export default function useSignalBinding(ctx: DrilldownContext): {
  bindTable: DrilldownActions['bindTable']
  initialize: (signal: 'logs' | 'traces') => Promise<void>
  openLogsForTrace: DrilldownActions['openLogsForTrace']
  closeLogsForTrace: DrilldownActions['closeLogsForTrace']
  setLogsRole: DrilldownActions['setLogsRole']
} {
  const generation: Record<'logs' | 'traces', number> = { logs: 0, traces: 0 }

  const restoreLogsDetailSelection = () => {
    if (ctx.ui.logsView.value !== 'detail') {
      return
    }
    if (ctx.ui.logsSelectedGroup.value) {
      return
    }
    const match = resolveLogsDetailGroupFromFilters(
      ctx.query.filters.value,
      ctx.semantics.logs.fieldMap.value,
      ctx.semantics.logs.entityFilterKeys.value?.service
    )
    if (match) {
      ctx.ui.logsSelectedGroup.value = match
    }
  }

  const bindTable: DrilldownActions['bindTable'] = async (signal, tableName, options) => {
    const trimmed = tableName.trim()
    if (!trimmed) {
      return
    }

    generation[signal] += 1
    const token = generation[signal]
    const scope = options?.scope ?? 'page'
    const persist = options?.persist ?? scope !== 'overlay'
    const connectionDb = signal === 'logs' ? ctx.connection.logsDatabase.value : ctx.connection.tracesDatabase.value
    const database = options?.database?.trim() || connectionDb
    const semantics = ctx.semantics[signal]

    // Identical page re-bind: skip unless settings save forces a fieldMap rebuild.
    if (
      scope !== 'overlay' &&
      !options?.fieldMap &&
      semantics.ready.value &&
      semantics.table.value === trimmed &&
      semantics.database.value === database
    ) {
      return
    }

    const inspection = await inspectSignalTable(signal, trimmed, database)
    if (token !== generation[signal]) {
      return
    }

    let nextMap: Record<string, string>

    if (signal === 'logs') {
      const schemaColumns = asSchemaColumns(inspection.columns)
      const current = loadDrilldownSettings(database).logs
      let savedOrOption: LogsFieldMapSettings | undefined
      if (options?.fieldMap) {
        savedOrOption = options.fieldMap
      } else if (current.table === trimmed) {
        savedOrOption = current.fieldMap
      }
      const serviceColumn = inspection.serviceRef ? entityColumnFilterKey(inspection.serviceRef) : undefined
      const seeded: LogsFieldMapSettings = {
        ...otelLogsFieldDefaultsFromColumns(schemaColumns, { serviceColumn }),
        ...(savedOrOption ?? {}),
      }
      if (!seeded.primaryGroupBy && seeded.service) {
        seeded.primaryGroupBy = seeded.service
      }

      if (persist && (current.table?.trim() !== trimmed || fieldMapKey(current.fieldMap) !== fieldMapKey(seeded))) {
        updateLogsDrilldownSettings({ table: trimmed, fieldMap: seeded }, database)
      }

      nextMap = buildLogsFieldMapFromColumns(schemaColumns, seeded)
    } else {
      nextMap = buildDefaultTracesFieldMap({
        serviceColumn: physicalServiceColumn(inspection.serviceRef),
      })
      if (persist) {
        updateTracesDrilldownSettings({ table: trimmed }, database)
      }
    }

    if (token !== generation[signal]) {
      return
    }

    semantics.commit({ database, table: trimmed, fieldMap: nextMap, inspection })

    // Shared filters belong to the Drilldown Context, not to this table. Signal adapters
    // already skip conditions without a physical mapping; pruning here would permanently
    // remove metric-only labels while logs/traces bind in the background.
    if (signal === 'logs' && scope !== 'overlay') {
      restoreLogsDetailSelection()
    }
  }

  const setLogsRole: DrilldownActions['setLogsRole'] = (role, column) => {
    const trimmed = column.trim()
    if (!trimmed || !FIELD_ROLES.includes(role as LogsRole)) {
      return
    }

    const columns = ctx.semantics.logs.columns.value
    if (columns?.length) {
      const columnSet = new Set(columns)
      if (role === 'service' || role === 'primaryGroupBy') {
        if (!isLogsRoleValue(trimmed, columnSet)) {
          return
        }
      } else if (!columnSet.has(trimmed)) {
        return
      }
    }

    if (ctx.semantics.logs.fieldMap.value[role] === trimmed) {
      return
    }

    const next = { ...ctx.semantics.logs.fieldMap.value, [role]: trimmed }
    const database = ctx.semantics.logs.database.value || ctx.connection.logsDatabase.value
    updateLogsDrilldownSettings(
      {
        table: ctx.semantics.logs.table.value || undefined,
        fieldMap: rolesFromFieldMap(next),
      },
      database
    )
    ctx.semantics.logs.setFieldMap(next)
  }

  const openLogsForTrace: DrilldownActions['openLogsForTrace'] = (traceId, target) => {
    const trimmed = traceId.trim()
    if (!trimmed) {
      return
    }

    // Open the drawer immediately; bind completes async and panels wait on ready/revision.
    ctx.ui.logsTraceId.value = trimmed
    if (ctx.ui.logsTab.value !== 'logs') {
      ctx.ui.logsTab.value = 'logs'
    }

    if (!ctx.session.binding.ready) {
      // Cold-start hydrate: the page bind has not run yet, so a snapshot now would capture
      // an unbound page. Queue the open; initialize('logs') flushes it after the page bind.
      const table = target?.table?.trim()
      ctx.session.overlayLogs.pending = {
        traceId: trimmed,
        database: target?.database?.trim(),
        table,
      }
      if (table) {
        ctx.session.overlayLogs.active = true
        ctx.session.overlayLogs.targetTable = table
      }
      return
    }

    const table = target?.table?.trim()
    // URL restore carries a table without a database — fall back to the page connection db
    // (cross-database overlay targets are not expressible in the URL, same as before).
    const database = target?.database?.trim() || ctx.connection.logsDatabase.value
    if (table && (database !== ctx.semantics.logs.database.value || table !== ctx.semantics.logs.table.value)) {
      const overlay = ctx.session.overlayLogs
      if (!overlay.active) {
        overlay.pageSnapshot = ctx.semantics.logs.takeSnapshot()
      }
      overlay.active = true
      overlay.targetTable = table
      // MUST NOT write connection.logsDatabase — overlay uses semantics.logs.database only.
      bindTable('logs', table, { database, scope: 'overlay', persist: false }).catch(() => {
        // Bind failed: drop overlay markers so URL sync / queries stay on the page binding.
        // Ignore if a newer open already replaced this target.
        if (overlay.targetTable !== table) {
          return
        }
        if (overlay.pageSnapshot) {
          generation.logs += 1
          ctx.semantics.logs.restoreSnapshot(overlay.pageSnapshot)
        }
        overlay.active = false
        overlay.targetTable = undefined
        overlay.pageSnapshot = undefined
      })
    }
  }

  const closeLogsForTrace: DrilldownActions['closeLogsForTrace'] = () => {
    const had = Boolean(ctx.ui.logsTraceId.value)
    ctx.ui.logsTraceId.value = undefined
    const overlay = ctx.session.overlayLogs
    if (overlay.pageSnapshot) {
      // Invalidate in-flight overlay binds so a late commit cannot overwrite the restore.
      generation.logs += 1
      ctx.semantics.logs.restoreSnapshot(overlay.pageSnapshot)
    }
    overlay.active = false
    overlay.targetTable = undefined
    overlay.pageSnapshot = undefined
    overlay.pending = undefined
    if (had && ctx.connection.signal.value === 'logs') {
      ctx.query.refreshKey.value += 1
    }
  }

  const flushPendingOverlayLogs = () => {
    const { pending } = ctx.session.overlayLogs
    if (!pending) {
      return
    }
    ctx.session.overlayLogs.pending = undefined
    openLogsForTrace(pending.traceId, pending.table ? { database: pending.database, table: pending.table } : undefined)
  }

  const initialize = async (signal: 'logs' | 'traces') => {
    ctx.session.binding.ready = true
    const database = signal === 'logs' ? ctx.connection.logsDatabase.value : ctx.connection.tracesDatabase.value
    const settings = loadDrilldownSettings(database)[signal]
    const settingsTable = settings?.table?.trim()
    const urlOrCurrent = ctx.semantics[signal].table.value?.trim()

    // URL / already-set table wins over persisted settings so deep links are authoritative.
    let table: string | undefined
    if (signal === 'logs') {
      table = urlOrCurrent || settingsTable || (await resolveSignalTable('logs', { database }))
    } else {
      table = urlOrCurrent || settingsTable || (await resolveSignalTable('traces', { settingsTable, database }))
    }

    try {
      if (!table) {
        return
      }

      // Logs init seeds settings gaps (persist true). Traces auto-discover / URL restore
      // historically did not save — only the picker persists.
      await bindTable(signal, table, {
        persist: signal === 'logs',
      })
    } finally {
      if (signal === 'logs') {
        flushPendingOverlayLogs()
      }
    }
  }

  ctx.session.binding.impl = {
    bindTable,
    openLogsForTrace,
    closeLogsForTrace,
    setLogsRole,
  }

  onMounted(() => {
    initialize('logs').catch(() => undefined)
    initialize('traces').catch(() => undefined)
  })

  watch(
    () => ctx.connection.logsDatabase.value,
    () => {
      if (ctx.ui.logsTraceId.value) {
        closeLogsForTrace()
      }
      ctx.semantics.logs.reset()
      initialize('logs').catch(() => undefined)
    }
  )

  watch(
    () => ctx.connection.tracesDatabase.value,
    () => {
      // Same as logs-db change: restore the page logs binding if Trace→Logs overlay is open.
      if (ctx.ui.logsTraceId.value || ctx.session.overlayLogs.active || ctx.session.overlayLogs.pending) {
        closeLogsForTrace()
      }
      ctx.semantics.traces.reset()
      ctx.ui.focusTraceId.value = undefined
      initialize('traces').catch(() => undefined)
    }
  )

  return {
    bindTable,
    initialize,
    openLogsForTrace,
    closeLogsForTrace,
    setLogsRole,
  }
}
