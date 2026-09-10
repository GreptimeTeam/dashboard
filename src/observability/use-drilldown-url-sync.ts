import { watch } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { isDrilldownFilterOp } from './filters'
import { DRILLDOWN_DEFAULT_TIME_MINUTES, type DrilldownContext } from './context'
import { isLogsDetailTab, isLogsView, isMetricDetailTab, type DrilldownFilter, type DrilldownSignal } from './types'

const DRILLDOWN_SIGNALS: DrilldownSignal[] = ['metrics', 'logs', 'traces']

function parseSignal(raw: unknown): DrilldownSignal {
  if (typeof raw === 'string' && DRILLDOWN_SIGNALS.includes(raw as DrilldownSignal)) {
    return raw as DrilldownSignal
  }
  return 'metrics'
}

function parseFilters(raw: unknown): DrilldownFilter[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item) => item && typeof item.key === 'string' && typeof item.value === 'string' && isDrilldownFilterOp(item.op)
    )
  } catch {
    return []
  }
}

function parseCsv(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function serializeFilters(filters: DrilldownFilter[]): string | undefined {
  if (!filters.length) {
    return undefined
  }
  return encodeURIComponent(JSON.stringify(filters))
}

function serializeCsv(values: string[]): string | undefined {
  if (!values.length) {
    return undefined
  }
  return values.join(',')
}

function normalizeTimeRange(ctx: DrilldownContext) {
  if (ctx.rangeTime.value.length !== 2 && ctx.time.value <= 0) {
    ctx.time.value = DRILLDOWN_DEFAULT_TIME_MINUTES
    ctx.rangeTime.value = []
  }
}

export default function useDrilldownUrlSync(
  ctx: DrilldownContext,
  route: RouteLocationNormalizedLoaded,
  router: Router
) {
  let syncingFromUrl = false

  const initializeFromQuery = () => {
    syncingFromUrl = true
    const { timeLength, timeRange, filters, prefixes, suffixes, metric, logsTable, signal, tab, logsView, logsTab } =
      route.query

    ctx.setSignal(parseSignal(signal))

    if (timeLength !== undefined) {
      const length = parseInt(String(timeLength), 10)
      if (!Number.isNaN(length) && length > 0) {
        ctx.time.value = length
        if (ctx.rangeTime.value.length > 0) {
          ctx.rangeTime.value = []
        }
      }
    }

    if (timeRange !== undefined) {
      const values = Array.isArray(timeRange) ? timeRange : [timeRange]
      if (values.length === 2) {
        ctx.rangeTime.value = values.map(String)
        ctx.time.value = 0
      }
    }

    ctx.setFilters(parseFilters(filters))
    ctx.setSidebarFilters({
      prefixes: parseCsv(prefixes),
      suffixes: parseCsv(suffixes),
      groupBy: 'none',
    })

    if (typeof metric === 'string' && metric.trim() && ctx.signal.value === 'metrics') {
      ctx.metric.value = metric
    } else {
      ctx.metric.value = undefined
    }

    if (ctx.metric.value && isMetricDetailTab(tab)) {
      ctx.setDetailTab(tab)
    } else {
      ctx.setDetailTab('breakdown')
    }

    if (typeof logsTable === 'string' && logsTable.trim()) {
      ctx.logsTable.value = logsTable.trim()
    } else if (!ctx.logsTable.value) {
      ctx.logsTable.value = undefined
    }

    if (ctx.signal.value === 'logs' && isLogsView(logsView)) {
      ctx.setLogsView(logsView)
    } else {
      ctx.setLogsView('overview')
    }

    if (ctx.signal.value === 'logs' && isLogsDetailTab(logsTab)) {
      ctx.setLogsTab(logsTab === 'logs' ? 'labels' : logsTab)
    } else {
      ctx.setLogsTab('labels')
    }

    // Restore selected group from primaryGroupBy filter when opening detail from URL.
    if (ctx.logsView.value === 'detail') {
      const groupCol = ctx.fieldMap.value.logs.primaryGroupBy
      const serviceChip = ctx.fieldMap.value.logs.service
      const chipKeys = new Set([groupCol, serviceChip, 'service'].filter(Boolean) as string[])
      const match = ctx.filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
      ctx.logsSelectedGroup.value = match?.value
    } else {
      ctx.logsSelectedGroup.value = undefined
    }

    normalizeTimeRange(ctx)

    syncingFromUrl = false
  }

  const updateQueryParams = () => {
    if (syncingFromUrl) {
      return
    }

    const query: Record<string, string | string[]> = {}

    if (ctx.rangeTime.value.length === 2) {
      query.timeRange = ctx.rangeTime.value.map(String)
    } else if (ctx.time.value > 0) {
      query.timeLength = String(ctx.time.value)
    }

    const filtersParam = serializeFilters(ctx.filters.value)
    if (filtersParam) {
      query.filters = filtersParam
    }

    const prefixesParam = serializeCsv(ctx.sidebarFilters.value.prefixes)
    if (prefixesParam) {
      query.prefixes = prefixesParam
    }

    const suffixesParam = serializeCsv(ctx.sidebarFilters.value.suffixes)
    if (suffixesParam) {
      query.suffixes = suffixesParam
    }

    if (ctx.signal.value !== 'metrics') {
      query.signal = ctx.signal.value
    }

    if (ctx.metric.value) {
      query.metric = ctx.metric.value
      // Default breakdown stays out of the URL to keep links short.
      if (ctx.detailTab.value !== 'breakdown') {
        query.tab = ctx.detailTab.value
      }
    }

    if (ctx.logsTable.value) {
      query.logsTable = ctx.logsTable.value
    }

    if (ctx.signal.value === 'logs') {
      if (ctx.logsView.value === 'detail') {
        query.logsView = 'detail'
      }
      if (ctx.logsTab.value !== 'labels') {
        query.logsTab = ctx.logsTab.value
      }
    }

    router.replace({ query })
  }

  watch(
    () => [ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1]],
    () => {
      if (syncingFromUrl) {
        return
      }
      normalizeTimeRange(ctx)
    }
  )

  watch(
    () => [
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
      ctx.sidebarFilters.value,
      ctx.signal.value,
      ctx.metric.value,
      ctx.detailTab.value,
      ctx.logsTable.value,
      ctx.logsView.value,
      ctx.logsTab.value,
    ],
    () => {
      updateQueryParams()
    },
    { deep: true }
  )

  return {
    initializeFromQuery,
    updateQueryParams,
  }
}
