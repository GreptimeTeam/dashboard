import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import useTimeRange from '@/hooks/use-time-range'
import {
  DEFAULT_FIELD_MAP,
  DEFAULT_SIDEBAR_FILTERS,
  type DrilldownFilter,
  type DrilldownFieldMap,
  type DrilldownSidebarFilters,
} from './types'
import { addFilter as mergeFilter } from './filters'

export interface DrilldownContext {
  filters: Ref<DrilldownFilter[]>
  sidebarFilters: Ref<DrilldownSidebarFilters>
  metric: Ref<string | undefined>
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
  setFilters: (filters: DrilldownFilter[]) => void
  setSidebarFilters: (filters: DrilldownSidebarFilters) => void
  appendFilter: (filter: DrilldownFilter) => void
}

export const DRILLDOWN_CONTEXT_KEY: InjectionKey<DrilldownContext> = Symbol('drilldownContext')

export function useDrilldownContextProvider(): DrilldownContext {
  const timeRangeHook = useTimeRange({ time: 15 })
  const filters = ref<DrilldownFilter[]>([])
  const sidebarFilters = ref<DrilldownSidebarFilters>({ ...DEFAULT_SIDEBAR_FILTERS })
  const metric = ref<string | undefined>()
  const focusTraceId = ref<string | undefined>()
  const logsTable = ref<string | undefined>()
  const tracesTable = ref<string | undefined>()
  const fieldMap = ref({ ...DEFAULT_FIELD_MAP })
  const refreshKey = ref(0)

  const triggerRefresh = () => {
    refreshKey.value += 1
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

  const context: DrilldownContext = {
    filters,
    sidebarFilters,
    metric,
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
    setFilters,
    setSidebarFilters,
    appendFilter,
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
