import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import useTimeRange from '@/hooks/use-time-range'
import {
  DEFAULT_FIELD_MAP,
  DEFAULT_SIDEBAR_FILTERS,
  type DrilldownFilter,
  type DrilldownFieldMap,
  type DrilldownSidebarFilters,
  type DrilldownSignal,
  type LogsDetailTab,
  type LogsView,
  type MetricDetailTab,
  type TracesHomeTab,
} from './types'
import { addFilter as mergeFilter, hasLogsMappedFilters, toggleIncludeFilter } from './filters'

export interface DrilldownContext {
  signal: Ref<DrilldownSignal>
  filters: Ref<DrilldownFilter[]>
  sidebarFilters: Ref<DrilldownSidebarFilters>
  metric: Ref<string | undefined>
  /** Active tab inside metric detail (synced to URL `tab`). */
  detailTab: Ref<MetricDetailTab>
  focusTraceId: Ref<string | undefined>
  logsTable: Ref<string | undefined>
  tracesTable: Ref<string | undefined>
  fieldMap: Ref<DrilldownFieldMap>
  /** Logs overview vs detail shell (URL `logsView`). */
  logsView: Ref<LogsView>
  /** Active tab inside logs detail (URL `logsTab`). */
  logsTab: Ref<LogsDetailTab>
  /** Active tab on traces home (URL `tracesTab`). */
  tracesTab: Ref<TracesHomeTab>
  /** primaryGroupBy value opened in logs detail (for close → remove filter). */
  logsSelectedGroup: Ref<string | undefined>
  time: Ref<number>
  rangeTime: Ref<string[]>
  unixTimeRange: () => number[]
  resetTimeRange: () => void
  refreshKey: Ref<number>
  triggerRefresh: () => void
  setSignal: (signal: DrilldownSignal) => void
  setFilters: (filters: DrilldownFilter[]) => void
  setSidebarFilters: (filters: DrilldownSidebarFilters) => void
  appendFilter: (filter: DrilldownFilter) => void
  /** Include/exclude toggle for the same label value (OR-merge / remove). */
  toggleFilterValue: (filter: DrilldownFilter) => void
  setDetailTab: (tab: MetricDetailTab) => void
  setLogsView: (view: LogsView) => void
  setLogsTab: (tab: LogsDetailTab) => void
  setTracesTab: (tab: TracesHomeTab) => void
  openLogsDetail: (groupValue?: string) => void
  closeLogsDetail: () => void
  openTraceGantt: (traceId: string) => void
  closeTraceGantt: () => void
}

export const DRILLDOWN_DEFAULT_TIME_MINUTES = 30

// Symbol.for so the key survives HMR module re-evaluation (plain Symbol() breaks inject → white screen).
export const DRILLDOWN_CONTEXT_KEY: InjectionKey<DrilldownContext> = Symbol.for(
  'greptime.drilldownContext'
) as InjectionKey<DrilldownContext>

export function useDrilldownContextProvider(): DrilldownContext {
  const timeRangeHook = useTimeRange({ time: DRILLDOWN_DEFAULT_TIME_MINUTES })
  const signal = ref<DrilldownSignal>('metrics')
  const filters = ref<DrilldownFilter[]>([])
  const sidebarFilters = ref<DrilldownSidebarFilters>({ ...DEFAULT_SIDEBAR_FILTERS })
  const metric = ref<string | undefined>()
  const detailTab = ref<MetricDetailTab>('breakdown')
  const focusTraceId = ref<string | undefined>()
  const logsTable = ref<string | undefined>()
  const tracesTable = ref<string | undefined>()
  const fieldMap = ref({ ...DEFAULT_FIELD_MAP })
  const logsView = ref<LogsView>('overview')
  const logsTab = ref<LogsDetailTab>('logs')
  const tracesTab = ref<TracesHomeTab>('breakdown')
  const logsSelectedGroup = ref<string | undefined>()
  const refreshKey = ref(0)

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

  /** Back to overview catalog; keep filters chips for compose. */
  const closeLogsDetail = () => {
    logsSelectedGroup.value = undefined
    logsView.value = 'overview'
    logsTab.value = 'logs'
  }

  const resolveLogsDetailGroupFromFilters = (): string | undefined => {
    const logsMap = fieldMap.value.logs
    const chipKeys = new Set([logsMap.primaryGroupBy, logsMap.service, 'service'].filter(Boolean) as string[])
    const match = filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
    return match?.value
  }

  const setSignal = (next: DrilldownSignal) => {
    if (next !== 'metrics') {
      metric.value = undefined
    }
    if (next !== 'traces') {
      focusTraceId.value = undefined
      tracesTab.value = 'breakdown'
    }
    if (next === 'logs') {
      if (hasLogsMappedFilters(filters.value, fieldMap.value.logs, logsTable.value)) {
        openLogsDetail(resolveLogsDetailGroupFromFilters())
      } else {
        logsView.value = 'overview'
        logsSelectedGroup.value = undefined
      }
    } else {
      logsView.value = 'overview'
      logsSelectedGroup.value = undefined
    }
    signal.value = next
  }

  const setFilters = (next: DrilldownFilter[]) => {
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

  const context: DrilldownContext = {
    signal,
    filters,
    sidebarFilters,
    metric,
    detailTab,
    focusTraceId,
    logsTable,
    tracesTable,
    fieldMap,
    logsView,
    logsTab,
    tracesTab,
    logsSelectedGroup,
    time: timeRangeHook.time,
    rangeTime: timeRangeHook.rangeTime,
    unixTimeRange: timeRangeHook.unixTimeRange,
    resetTimeRange: timeRangeHook.reset,
    refreshKey,
    triggerRefresh,
    setSignal,
    setFilters,
    setSidebarFilters,
    appendFilter,
    toggleFilterValue,
    setDetailTab,
    setLogsView,
    setLogsTab,
    setTracesTab,
    openLogsDetail,
    closeLogsDetail,
    openTraceGantt,
    closeTraceGantt,
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
