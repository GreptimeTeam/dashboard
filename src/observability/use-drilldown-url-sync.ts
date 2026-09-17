import { nextTick, watch } from 'vue'
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { isLogsBodyOp, logsBodyOpNeedsValue, DEFAULT_LOGS_BODY_OP } from './logs/body-search'
import { isDrilldownFilterOp } from './filters'
import { DRILLDOWN_DEFAULT_TIME_MINUTES, type DrilldownContext } from './context'
import { drilldownQueriesEqual, shouldPushDrilldownHistory } from './drilldown-url-history'
import { readUrlTab, urlTabWatchSources, writeUrlTab, type DrilldownUrlTabSpec } from './drilldown-url-tabs'
import {
  isLogsDetailTab,
  isLogsView,
  isMetricDetailTab,
  isTracesHomeTab,
  type DrilldownFilter,
  type DrilldownSignal,
  type LogsDetailTab,
  type MetricDetailTab,
  type TracesHomeTab,
} from './types'

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

/** Panel tabs that sync through URL (default omitted). */
function buildUrlTabSpecs(ctx: DrilldownContext): DrilldownUrlTabSpec[] {
  const metricTab: DrilldownUrlTabSpec<MetricDetailTab> = {
    queryKey: 'tab',
    defaultTab: 'breakdown',
    isTab: isMetricDetailTab,
    get: () => ctx.detailTab.value,
    set: (tab) => ctx.setDetailTab(tab),
    active: () => Boolean(ctx.metric.value),
  }
  const logsTab: DrilldownUrlTabSpec<LogsDetailTab> = {
    queryKey: 'logsTab',
    defaultTab: 'logs',
    isTab: isLogsDetailTab,
    get: () => ctx.logsTab.value,
    set: (tab) => ctx.setLogsTab(tab),
    active: () => ctx.signal.value === 'logs',
  }
  const tracesTab: DrilldownUrlTabSpec<TracesHomeTab> = {
    queryKey: 'tracesTab',
    defaultTab: 'breakdown',
    isTab: isTracesHomeTab,
    get: () => ctx.tracesTab.value,
    set: (tab) => ctx.setTracesTab(tab),
    active: () => ctx.signal.value === 'traces',
  }
  return [metricTab, logsTab, tracesTab]
}

export default function useDrilldownUrlSync(
  ctx: DrilldownContext,
  route: RouteLocationNormalizedLoaded,
  router: Router
) {
  let syncingFromUrl = false
  let writingToUrl = false
  const tabSpecs = buildUrlTabSpecs(ctx)

  const applyQueryToContext = (query: LocationQuery = route.query) => {
    syncingFromUrl = true
    const {
      timeLength,
      timeRange,
      filters,
      prefixes,
      suffixes,
      metric,
      logsTable,
      tracesTable,
      focusTraceId,
      signal,
      tab,
      logsView,
      logsTab,
      tracesTab,
      body,
      bodyOp,
    } = query

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

    if (typeof logsTable === 'string' && logsTable.trim()) {
      ctx.logsTable.value = logsTable.trim()
    } else if (!ctx.logsTable.value) {
      ctx.logsTable.value = undefined
    }

    if (typeof tracesTable === 'string' && tracesTable.trim()) {
      ctx.tracesTable.value = tracesTable.trim()
    } else if (!ctx.tracesTable.value) {
      ctx.tracesTable.value = undefined
    }

    const traceIdFromUrl = typeof focusTraceId === 'string' ? focusTraceId.trim() : ''
    if (traceIdFromUrl && (ctx.signal.value === 'traces' || ctx.signal.value === 'logs')) {
      ctx.focusTraceId.value = traceIdFromUrl
    } else {
      ctx.focusTraceId.value = undefined
    }

    if (ctx.signal.value === 'logs' && isLogsView(logsView)) {
      ctx.setLogsView(logsView)
    } else {
      ctx.setLogsView('overview')
    }

    const tabRawByKey: Record<string, unknown> = {
      tab,
      logsTab,
      tracesTab,
    }
    tabSpecs.forEach((spec) => {
      readUrlTab(spec, tabRawByKey[spec.queryKey])
    })

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

    if (ctx.signal.value === 'logs' && ctx.logsView.value === 'detail') {
      const opRaw = typeof bodyOp === 'string' ? bodyOp : ''
      ctx.logsBodyOp.value = isLogsBodyOp(opRaw) ? opRaw : DEFAULT_LOGS_BODY_OP
      ctx.logsBodyValue.value = typeof body === 'string' ? body : ''
    } else {
      ctx.logsBodyOp.value = DEFAULT_LOGS_BODY_OP
      ctx.logsBodyValue.value = ''
    }

    normalizeTimeRange(ctx)

    // Keep the flag through the flush of Context watchers scheduled by this apply.
    nextTick(() => {
      syncingFromUrl = false
    })
  }

  const initializeFromQuery = () => {
    applyQueryToContext(route.query)
  }

  const buildQueryFromContext = (): Record<string, string | string[]> => {
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
    }

    if (ctx.logsTable.value) {
      query.logsTable = ctx.logsTable.value
    }

    if (ctx.tracesTable.value) {
      query.tracesTable = ctx.tracesTable.value
    }

    if ((ctx.signal.value === 'traces' || ctx.signal.value === 'logs') && ctx.focusTraceId.value) {
      query.focusTraceId = ctx.focusTraceId.value
    }

    if (ctx.signal.value === 'logs' && ctx.logsView.value === 'detail') {
      query.logsView = 'detail'
      const bodyValue = ctx.logsBodyValue.value.trim()
      const bodyActive = Boolean(bodyValue) || !logsBodyOpNeedsValue(ctx.logsBodyOp.value)
      if (bodyActive) {
        query.bodyOp = ctx.logsBodyOp.value
        if (bodyValue) {
          query.body = bodyValue
        }
      }
    }

    tabSpecs.forEach((spec) => {
      writeUrlTab(query, spec)
    })

    return query
  }

  const updateQueryParams = () => {
    if (syncingFromUrl || writingToUrl) {
      return
    }

    const query = buildQueryFromContext()
    if (drilldownQueriesEqual(route.query as Record<string, unknown>, query)) {
      return
    }

    const usePush = shouldPushDrilldownHistory(route.query as Record<string, unknown>, query)
    writingToUrl = true
    const navigate = usePush ? router.push({ query }) : router.replace({ query })
    Promise.resolve(navigate).finally(() => {
      writingToUrl = false
    })
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
      ctx.logsTable.value,
      ctx.logsView.value,
      ctx.logsBodyOp.value,
      ctx.logsBodyValue.value,
      ctx.tracesTable.value,
      ctx.focusTraceId.value,
      ...urlTabWatchSources(tabSpecs),
    ],
    () => {
      updateQueryParams()
    },
    { deep: true }
  )

  watch(
    () => route.query,
    () => {
      if (syncingFromUrl || writingToUrl) {
        return
      }
      applyQueryToContext(route.query)
    }
  )

  return {
    initializeFromQuery,
    applyQueryToContext,
    updateQueryParams,
  }
}
