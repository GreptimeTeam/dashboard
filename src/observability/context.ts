import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import useTimeRange from '@/hooks/use-time-range'
import {
  DEFAULT_FIELD_MAP,
  DEFAULT_SIDEBAR_FILTERS,
  type DrilldownFilter,
  type DrilldownFieldMap,
  type DrilldownSidebarFilters,
  type DrilldownSignal,
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
  const refreshKey = ref(0)

  const triggerRefresh = () => {
    refreshKey.value += 1
  }

  const setSignal = (next: DrilldownSignal) => {
    if (next !== 'metrics') {
      metric.value = undefined
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
