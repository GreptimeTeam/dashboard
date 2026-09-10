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
} from './types'
import { addFilter as mergeFilter } from './filters'

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
  setDetailTab: (tab: MetricDetailTab) => void
  setLogsView: (view: LogsView) => void
  setLogsTab: (tab: LogsDetailTab) => void
  openLogsDetail: (groupValue: string) => void
  closeLogsDetail: () => void
}

export const DRILLDOWN_DEFAULT_TIME_MINUTES = 30

export const DRILLDOWN_CONTEXT_KEY: InjectionKey<DrilldownContext> = Symbol('drilldownContext')

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
  const logsTab = ref<LogsDetailTab>('labels')
  const logsSelectedGroup = ref<string | undefined>()
  const refreshKey = ref(0)

  const triggerRefresh = () => {
    refreshKey.value += 1
  }

  const setSignal = (next: DrilldownSignal) => {
    if (next !== 'metrics') {
      metric.value = undefined
    }
    if (next !== 'logs') {
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

  const setDetailTab = (tab: MetricDetailTab) => {
    detailTab.value = tab
  }

  const setLogsView = (view: LogsView) => {
    logsView.value = view
  }

  const setLogsTab = (tab: LogsDetailTab) => {
    logsTab.value = tab
  }

  const openLogsDetail = (groupValue: string) => {
    logsSelectedGroup.value = groupValue
    logsView.value = 'detail'
    if (logsTab.value !== 'labels') {
      logsTab.value = 'labels'
    }
  }

  const closeLogsDetail = () => {
    const group = logsSelectedGroup.value
    const groupCol = fieldMap.value.logs.primaryGroupBy
    const serviceChip = fieldMap.value.logs.service
    if (group !== undefined && groupCol) {
      const chipKeys = new Set([groupCol, serviceChip, 'service', 'primaryGroupBy'].filter(Boolean) as string[])
      filters.value = filters.value.filter((f) => !(f.op === '=' && f.value === group && chipKeys.has(f.key)))
    }
    logsSelectedGroup.value = undefined
    logsView.value = 'overview'
    logsTab.value = 'labels'
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
    setDetailTab,
    setLogsView,
    setLogsTab,
    openLogsDetail,
    closeLogsDetail,
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
