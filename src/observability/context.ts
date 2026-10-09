import { computed, inject, provide, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import useTimeRange from '@/hooks/use-time-range'
import {
  entityColumnFilterKey,
  logsServiceFilterCandidateKeys,
  normalizeEntityFilters,
  type SignalTableInspection,
} from './semantics'
import type { LogsFieldMapSettings } from './drilldown-settings'
import { DEFAULT_LOGS_BODY_OP, type LogsBodyOp } from './logs/body-search'
import { useSignalDatabase } from './signal-database'
import {
  DEFAULT_SIDEBAR_FILTERS,
  type DrilldownFilter,
  type DrilldownSidebarFilters,
  type DrilldownSignal,
  type LogsDetailTab,
  type LogsView,
  type MetricDetailTab,
  type TracesHomeTab,
} from './types'
import { addFilter as mergeFilter, filterKey, hasLogsMappedFilters, toggleIncludeFilter } from './filters'

export interface SignalSemanticSnapshot {
  database: string | undefined
  table: string | undefined
  fieldMap: Record<string, string>
  entityFilterKeys: Record<string, string>
  columns: string[] | undefined
  columnTypes: Record<string, string> | undefined
}

export interface SignalSemanticState {
  database: Ref<string | undefined>
  table: Ref<string | undefined>
  fieldMap: Ref<Record<string, string>>
  entityFilterKeys: Ref<Record<string, string>>
  columns: Ref<string[] | undefined>
  columnTypes: Ref<Record<string, string> | undefined>
  revision: Ref<number>
  ready: ComputedRef<boolean>

  setTable(table: string | undefined): void
  setFieldMap(fieldMap: Record<string, string>): void
  setEntityFilterKey(entityKey: string, key: string | undefined): void
  setColumns(columns: string[] | undefined): void
  setColumnTypes(types: Record<string, string> | undefined): void
  /** From inspectSignalTable: write service key + columns + types; empty columns clears them */
  applyInspection(inspection: SignalTableInspection): void
  /**
   * Atomic bind write: database/table/fieldMap + inspection-derived entity/columns/types,
   * then revision += 1 exactly once. Empty inspection.columns clears entity/columns/types
   * while keeping the passed database/table/fieldMap.
   */
  commit(next: {
    database: string
    table: string
    fieldMap: Record<string, string>
    inspection: SignalTableInspection
  }): void
  takeSnapshot(): SignalSemanticSnapshot
  restoreSnapshot(snap: SignalSemanticSnapshot): void
  reset(): void
}

export interface DrilldownConnectionState {
  signal: Ref<DrilldownSignal>
  metricsDatabase: Ref<string>
  logsDatabase: Ref<string>
  tracesDatabase: Ref<string>
  databaseFor: (signal: DrilldownSignal) => string
}

export interface DrilldownQueryState {
  filters: Ref<DrilldownFilter[]>
  sidebarFilters: Ref<DrilldownSidebarFilters>
  time: Ref<number>
  rangeTime: Ref<string[]>
  unixTimeRange: () => number[]
  resetTimeRange: () => void
  refreshKey: Ref<number>
}

export interface DrilldownUiState {
  metric: Ref<string | undefined>
  detailTab: Ref<MetricDetailTab>
  focusTraceId: Ref<string | undefined>
  logsTraceId: Ref<string | undefined>
  logsView: Ref<LogsView>
  logsTab: Ref<LogsDetailTab>
  logsBodyOp: Ref<LogsBodyOp>
  logsBodyValue: Ref<string>
  tracesTab: Ref<TracesHomeTab>
  logsSelectedGroup: Ref<string | undefined>
}

export interface DrilldownActions {
  triggerRefresh: () => void
  /**
   * Switch the active signal. Pass `{ hydrate: true }` from URL restore so we only
   * update `signal` (and clear metric when leaving metrics) — drawers, logs view,
   * tabs, and filters are applied by the caller from the query.
   */
  setSignal: (signal: DrilldownSignal, options?: { hydrate?: boolean }) => void
  setFilters: (filters: DrilldownFilter[]) => void
  setSidebarFilters: (filters: DrilldownSidebarFilters) => void
  appendFilter: (filter: DrilldownFilter) => void
  toggleFilterValue: (filter: DrilldownFilter) => void
  setDetailTab: (tab: MetricDetailTab) => void
  setLogsView: (view: LogsView) => void
  setLogsTab: (tab: LogsDetailTab) => void
  setTracesTab: (tab: TracesHomeTab) => void
  openLogsDetail: (groupValue?: string) => void
  closeLogsDetail: () => void
  openTraceGantt: (traceId: string) => void
  closeTraceGantt: () => void
  openLogsForTrace: (traceId: string, target?: { database?: string; table?: string }) => void
  closeLogsForTrace: () => void
  /**
   * Sole writer of `semantics.{logs|traces}` for table binds. Implemented by
   * `useSignalBinding` — the stub throws until the binder registers.
   */
  bindTable: (
    signal: 'logs' | 'traces',
    table: string,
    options?: {
      database?: string
      fieldMap?: LogsFieldMapSettings
      persist?: boolean
      scope?: 'page' | 'overlay'
    }
  ) => Promise<void>
  /**
   * Assign a logs field role to a physical column (or JSON chip for service /
   * primaryGroupBy). Persists settings and bumps revision via setFieldMap.
   */
  setLogsRole: (role: 'time' | 'body' | 'severity' | 'service' | 'primaryGroupBy' | 'traceId', column: string) => void
}

export interface DrilldownContext {
  connection: DrilldownConnectionState
  query: DrilldownQueryState
  semantics: { logs: SignalSemanticState; traces: SignalSemanticState }
  ui: DrilldownUiState
  actions: DrilldownActions
}

export const DRILLDOWN_DEFAULT_TIME_MINUTES = 30

// Symbol.for so the key survives HMR module re-evaluation (plain Symbol() breaks inject → white screen).
export const DRILLDOWN_CONTEXT_KEY: InjectionKey<DrilldownContext> = Symbol.for(
  'greptime.drilldownContext'
) as InjectionKey<DrilldownContext>

function createSignalSemanticState(): SignalSemanticState {
  const database = ref<string | undefined>()
  const table = ref<string | undefined>()
  const fieldMap = ref<Record<string, string>>({})
  const entityFilterKeys = ref<Record<string, string>>({})
  const columns = ref<string[] | undefined>()
  const columnTypes = ref<Record<string, string> | undefined>()
  const revision = ref(0)
  const ready = computed(() => Boolean(table.value && columns.value?.length))

  const bumpRevision = () => {
    revision.value += 1
  }

  const writeEntityServiceKey = (serviceKey: string | undefined) => {
    const next = { ...entityFilterKeys.value }
    if (serviceKey) {
      next.service = serviceKey
    } else {
      delete next.service
    }
    entityFilterKeys.value = next
  }

  const writeInspectionDerived = (inspection: SignalTableInspection) => {
    const { columns: inspectedColumns, serviceRef } = inspection
    if (!inspectedColumns.length) {
      entityFilterKeys.value = {}
      columns.value = undefined
      columnTypes.value = undefined
      return
    }
    writeEntityServiceKey(serviceRef ? entityColumnFilterKey(serviceRef) : undefined)
    columns.value = inspectedColumns.map((column) => column.name)
    columnTypes.value = Object.fromEntries(inspectedColumns.map((column) => [column.name, column.data_type || '']))
  }

  const setTable = (next: string | undefined) => {
    table.value = next
    bumpRevision()
  }

  const setFieldMap = (next: Record<string, string>) => {
    fieldMap.value = next
    bumpRevision()
  }

  const setEntityFilterKey = (entityKey: string, key: string | undefined) => {
    const next = { ...entityFilterKeys.value }
    if (key) {
      next[entityKey] = key
    } else {
      delete next[entityKey]
    }
    entityFilterKeys.value = next
    bumpRevision()
  }

  const setColumns = (next: string[] | undefined) => {
    columns.value = next?.length ? next : undefined
    bumpRevision()
  }

  const setColumnTypes = (types: Record<string, string> | undefined) => {
    columnTypes.value = types && Object.keys(types).length ? types : undefined
    bumpRevision()
  }

  const applyInspection = (inspection: SignalTableInspection) => {
    writeInspectionDerived(inspection)
    bumpRevision()
  }

  const commit = (next: {
    database: string
    table: string
    fieldMap: Record<string, string>
    inspection: SignalTableInspection
  }) => {
    database.value = next.database
    table.value = next.table
    fieldMap.value = next.fieldMap
    writeInspectionDerived(next.inspection)
    bumpRevision()
  }

  const takeSnapshot = (): SignalSemanticSnapshot => ({
    database: database.value,
    table: table.value,
    fieldMap: { ...fieldMap.value },
    entityFilterKeys: { ...entityFilterKeys.value },
    columns: columns.value ? [...columns.value] : undefined,
    columnTypes: columnTypes.value ? { ...columnTypes.value } : undefined,
  })

  const restoreSnapshot = (snap: SignalSemanticSnapshot) => {
    database.value = snap.database
    table.value = snap.table
    fieldMap.value = { ...snap.fieldMap }
    entityFilterKeys.value = { ...snap.entityFilterKeys }
    columns.value = snap.columns ? [...snap.columns] : undefined
    columnTypes.value = snap.columnTypes ? { ...snap.columnTypes } : undefined
    bumpRevision()
  }

  const reset = () => {
    database.value = undefined
    table.value = undefined
    fieldMap.value = {}
    entityFilterKeys.value = {}
    columns.value = undefined
    columnTypes.value = undefined
    bumpRevision()
  }

  return {
    database,
    table,
    fieldMap,
    entityFilterKeys,
    columns,
    columnTypes,
    revision,
    ready,
    setTable,
    setFieldMap,
    setEntityFilterKey,
    setColumns,
    setColumnTypes,
    applyInspection,
    commit,
    takeSnapshot,
    restoreSnapshot,
    reset,
  }
}

export function useDrilldownContextProvider(): DrilldownContext {
  const timeRangeHook = useTimeRange({ time: DRILLDOWN_DEFAULT_TIME_MINUTES })
  const signal = ref<DrilldownSignal>('metrics')
  const metricsDatabase = useSignalDatabase('metrics')
  const logsDatabase = useSignalDatabase('logs')
  const tracesDatabase = useSignalDatabase('traces')
  const databaseFor = (signalName: DrilldownSignal): string => {
    if (signalName === 'metrics') {
      return metricsDatabase.value
    }
    if (signalName === 'logs') {
      return logsDatabase.value
    }
    return tracesDatabase.value
  }

  const filters = ref<DrilldownFilter[]>([])
  const sidebarFilters = ref<DrilldownSidebarFilters>({ ...DEFAULT_SIDEBAR_FILTERS })
  const refreshKey = ref(0)

  const metric = ref<string | undefined>()
  const detailTab = ref<MetricDetailTab>('breakdown')
  const focusTraceId = ref<string | undefined>()
  const logsTraceId = ref<string | undefined>()
  const logsView = ref<LogsView>('overview')
  const logsTab = ref<LogsDetailTab>('logs')
  const logsBodyOp = ref<LogsBodyOp>(DEFAULT_LOGS_BODY_OP)
  const logsBodyValue = ref('')
  const tracesTab = ref<TracesHomeTab>('breakdown')
  const logsSelectedGroup = ref<string | undefined>()

  const logsSemantics = createSignalSemanticState()
  const tracesSemantics = createSignalSemanticState()

  const triggerRefresh = () => {
    refreshKey.value += 1
  }

  const openLogsDetail = (groupValue?: string) => {
    logsSelectedGroup.value = groupValue
    logsView.value = 'detail'
    if (logsTab.value !== 'logs') {
      logsTab.value = 'logs'
    }
  }

  const clearLogsBodySearch = () => {
    logsBodyOp.value = DEFAULT_LOGS_BODY_OP
    logsBodyValue.value = ''
  }

  /** Back to overview catalog; keep filters chips for compose. */
  const closeLogsDetail = () => {
    logsSelectedGroup.value = undefined
    logsView.value = 'overview'
    logsTab.value = 'logs'
    clearLogsBodySearch()
  }

  const resolveLogsDetailGroupFromFilters = (): string | undefined => {
    // The service filter may arrive as a JSON chip (logs identity lives in
    // `resource_attributes`), so include the key resolved from the bound table.
    const chipKeys = logsServiceFilterCandidateKeys(
      logsSemantics.fieldMap.value,
      logsSemantics.entityFilterKeys.value.service
    )
    const match = filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
    return match?.value
  }

  // Declared before setSignal so setSignal can call through the mutable actions object
  // (useSignalBinding replaces open/close/bindTable on the same object).
  const actions: DrilldownActions = {
    triggerRefresh,
    setSignal: () => undefined,
    setFilters: () => undefined,
    setSidebarFilters: () => undefined,
    appendFilter: () => undefined,
    toggleFilterValue: () => undefined,
    setDetailTab: () => undefined,
    setLogsView: () => undefined,
    setLogsTab: () => undefined,
    setTracesTab: () => undefined,
    openLogsDetail,
    closeLogsDetail,
    openTraceGantt: () => undefined,
    closeTraceGantt: () => undefined,
    openLogsForTrace: () => undefined,
    closeLogsForTrace: () => undefined,
    bindTable: async () => {
      throw new Error('Signal binding is not ready')
    },
    setLogsRole: () => {
      throw new Error('Signal binding is not ready')
    },
  }

  const setSignal = (next: DrilldownSignal, options?: { hydrate?: boolean }) => {
    // URL restore owns filters / drawers / logsView / tabs from the query — only flip
    // the signal (and drop metric when leaving metrics) so we do not tear down
    // Trace→Logs overlay state that the URL still wants open.
    if (options?.hydrate) {
      if (next !== 'metrics') {
        metric.value = undefined
      }
      signal.value = next
      return
    }

    // One shared filter list: re-key entity filters into the target signal's vocabulary.
    // The bound table's resolved key wins (logs may need a JSON chip, traces a column);
    // without one we fall back to the signal's convention.
    let targetSemantics: SignalSemanticState | undefined
    if (next === 'logs') {
      targetSemantics = logsSemantics
    } else if (next === 'traces') {
      targetSemantics = tracesSemantics
    }
    filters.value = normalizeEntityFilters(
      filters.value,
      next,
      (entity) => targetSemantics?.entityFilterKeys.value[entity]
    )
    if (next !== 'metrics') {
      metric.value = undefined
    }
    if (next !== 'traces') {
      tracesTab.value = 'breakdown'
      // Prefer binder close so overlay snapshot restores; falls back to clearing the id.
      actions.closeLogsForTrace()
    }
    // Trace drawer lives on logs and traces. Keep it when staying on logs or opening traces.
    if (next === 'metrics' || (next !== signal.value && next !== 'traces')) {
      focusTraceId.value = undefined
    }
    if (next === 'logs') {
      if (
        hasLogsMappedFilters(
          filters.value,
          logsSemantics.fieldMap.value,
          logsSemantics.table.value,
          logsSemantics.columns.value
        )
      ) {
        openLogsDetail(resolveLogsDetailGroupFromFilters())
      } else {
        logsView.value = 'overview'
        logsSelectedGroup.value = undefined
        clearLogsBodySearch()
      }
    } else {
      logsView.value = 'overview'
      logsSelectedGroup.value = undefined
      clearLogsBodySearch()
    }
    signal.value = next
  }

  const setFilters = (next: DrilldownFilter[]) => {
    // Normalize/encode passes rebuild the array — a content-identical result must not
    // re-trigger the deep filters watchers (they would re-run identical queries).
    if (
      filters.value.length === next.length &&
      filters.value.every((filter, index) => filterKey(filter) === filterKey(next[index]))
    ) {
      return
    }
    filters.value = next
  }

  const setSidebarFilters = (next: DrilldownSidebarFilters) => {
    sidebarFilters.value = next
  }

  const appendFilter = (filter: DrilldownFilter) => {
    setFilters(mergeFilter(filters.value, filter))
  }

  const toggleFilterValue = (filter: DrilldownFilter) => {
    setFilters(toggleIncludeFilter(filters.value, filter))
  }

  const setDetailTab = (tab: MetricDetailTab) => {
    detailTab.value = tab
  }

  const setLogsView = (view: LogsView) => {
    logsView.value = view
  }

  const setLogsTab = (tab: LogsDetailTab) => {
    logsTab.value = tab
  }

  const setTracesTab = (tab: TracesHomeTab) => {
    tracesTab.value = tab
  }

  const openTraceGantt = (traceId: string) => {
    const trimmed = traceId.trim()
    if (!trimmed) {
      return
    }
    focusTraceId.value = trimmed
  }

  /** Back to traces home; keep filter chips. */
  const closeTraceGantt = () => {
    focusTraceId.value = undefined
  }

  /** Stub until useSignalBinding replaces with overlay-safe bind (no logsDatabase write). */
  const openLogsForTrace = (traceId: string, _target?: { database?: string; table?: string }) => {
    const trimmed = traceId.trim()
    if (!trimmed) {
      return
    }
    logsTraceId.value = trimmed
    if (logsTab.value !== 'logs') {
      logsTab.value = 'logs'
    }
  }

  /** Stub until useSignalBinding replaces with snapshot restore. */
  const closeLogsForTrace = () => {
    const hadTraceDrawer = Boolean(logsTraceId.value)
    logsTraceId.value = undefined
    if (hadTraceDrawer && signal.value === 'logs') {
      refreshKey.value += 1
    }
  }

  Object.assign(actions, {
    setSignal,
    setFilters,
    setSidebarFilters,
    appendFilter,
    toggleFilterValue,
    setDetailTab,
    setLogsView,
    setLogsTab,
    setTracesTab,
    openTraceGantt,
    closeTraceGantt,
    openLogsForTrace,
    closeLogsForTrace,
  })

  const context: DrilldownContext = {
    connection: {
      signal,
      metricsDatabase,
      logsDatabase,
      tracesDatabase,
      databaseFor,
    },
    query: {
      filters,
      sidebarFilters,
      time: timeRangeHook.time,
      rangeTime: timeRangeHook.rangeTime,
      unixTimeRange: timeRangeHook.unixTimeRange,
      resetTimeRange: timeRangeHook.reset,
      refreshKey,
    },
    semantics: {
      logs: logsSemantics,
      traces: tracesSemantics,
    },
    ui: {
      metric,
      detailTab,
      focusTraceId,
      logsTraceId,
      logsView,
      logsTab,
      logsBodyOp,
      logsBodyValue,
      tracesTab,
      logsSelectedGroup,
    },
    actions,
  }

  provide(DRILLDOWN_CONTEXT_KEY, context)
  return context
}

export function useDrilldownContext(): DrilldownContext {
  const context = inject(DRILLDOWN_CONTEXT_KEY)
  if (!context) {
    throw new Error('useDrilldownContext must be used within DrilldownPage')
  }
  return context
}
