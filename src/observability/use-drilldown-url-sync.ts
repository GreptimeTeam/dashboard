import { nextTick, watch } from 'vue'
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { isLogsBodyOp, logsBodyOpNeedsValue, DEFAULT_LOGS_BODY_OP } from './logs/body-search'
import { isDrilldownFilterOp } from './filters'
import { DRILLDOWN_DEFAULT_TIME_MINUTES, type DrilldownContext } from './context'
import { drilldownQueriesEqual, shouldPushDrilldownHistory } from './drilldown-url-history'
import { readUrlTab, urlTabWatchSources, writeUrlTab, type DrilldownUrlTabSpec } from './drilldown-url-tabs'
import { isSignalBindingStarted } from './signal-binding'
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
  if (ctx.query.rangeTime.value.length !== 2 && ctx.query.time.value <= 0) {
    ctx.query.time.value = DRILLDOWN_DEFAULT_TIME_MINUTES
    ctx.query.rangeTime.value = []
  }
}

/** Panel tabs that sync through URL (default omitted). */
function buildUrlTabSpecs(ctx: DrilldownContext): DrilldownUrlTabSpec[] {
  const metricTab: DrilldownUrlTabSpec<MetricDetailTab> = {
    queryKey: 'tab',
    defaultTab: 'breakdown',
    isTab: isMetricDetailTab,
    get: () => ctx.ui.detailTab.value,
    set: (tab) => ctx.actions.setDetailTab(tab),
    active: () => Boolean(ctx.ui.metric.value),
  }
  const logsTab: DrilldownUrlTabSpec<LogsDetailTab> = {
    queryKey: 'logsTab',
    defaultTab: 'logs',
    isTab: isLogsDetailTab,
    get: () => ctx.ui.logsTab.value,
    set: (tab) => ctx.actions.setLogsTab(tab),
    active: () => ctx.connection.signal.value === 'logs',
  }
  const tracesTab: DrilldownUrlTabSpec<TracesHomeTab> = {
    queryKey: 'tracesTab',
    defaultTab: 'breakdown',
    isTab: isTracesHomeTab,
    get: () => ctx.ui.tracesTab.value,
    set: (tab) => ctx.actions.setTracesTab(tab),
    active: () => ctx.connection.signal.value === 'traces',
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

  const finishSyncingFromUrl = (pendingBinds: Promise<unknown>[]) => {
    // Hold the flag until URL-driven binds settle so their commits cannot echo
    // a context→URL write that races with popstate.
    Promise.all(pendingBinds)
      .catch(() => undefined)
      .finally(() => {
        nextTick(() => {
          syncingFromUrl = false
        })
      })
  }

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
      logsTraceId,
      signal,
      tab,
      logsView,
      logsTab,
      tracesTab,
      body,
      bodyOp,
    } = query

    const nextSignal = parseSignal(signal)
    // Soft hydrate: do not close Trace→Logs overlay or infer logsView from in-memory filters.
    ctx.actions.setSignal(nextSignal, { hydrate: true })

    if (timeLength !== undefined) {
      const length = parseInt(String(timeLength), 10)
      if (!Number.isNaN(length) && length > 0) {
        ctx.query.time.value = length
        if (ctx.query.rangeTime.value.length > 0) {
          ctx.query.rangeTime.value = []
        }
      }
    }

    if (timeRange !== undefined) {
      const values = Array.isArray(timeRange) ? timeRange : [timeRange]
      if (values.length === 2) {
        ctx.query.rangeTime.value = values.map(String)
        ctx.query.time.value = 0
      }
    }

    // Filters before logsView / drawer restore so detail selection sees URL chips.
    ctx.actions.setFilters(parseFilters(filters))
    ctx.actions.setSidebarFilters({
      prefixes: parseCsv(prefixes),
      suffixes: parseCsv(suffixes),
      groupBy: 'none',
    })

    if (typeof metric === 'string' && metric.trim() && ctx.connection.signal.value === 'metrics') {
      ctx.ui.metric.value = metric
    } else {
      ctx.ui.metric.value = undefined
    }

    const pendingBinds: Promise<unknown>[] = []

    if (typeof logsTable === 'string' && logsTable.trim()) {
      const logsTableName = logsTable.trim()
      if (isSignalBindingStarted()) {
        pendingBinds.push(ctx.actions.bindTable('logs', logsTableName, { persist: false }).catch(() => undefined))
      } else {
        ctx.semantics.logs.setTable(logsTableName)
      }
    } else if (!ctx.semantics.logs.table.value) {
      ctx.semantics.logs.setTable(undefined)
    }

    if (typeof tracesTable === 'string' && tracesTable.trim()) {
      const tracesTableName = tracesTable.trim()
      if (isSignalBindingStarted()) {
        pendingBinds.push(ctx.actions.bindTable('traces', tracesTableName, { persist: false }).catch(() => undefined))
      } else {
        ctx.semantics.traces.setTable(tracesTableName)
      }
    } else if (!ctx.semantics.traces.table.value) {
      ctx.semantics.traces.setTable(undefined)
    }

    if (ctx.connection.signal.value === 'logs' && isLogsView(logsView)) {
      ctx.actions.setLogsView(logsView)
    } else {
      ctx.actions.setLogsView('overview')
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
    if (ctx.ui.logsView.value === 'detail') {
      const groupCol = ctx.semantics.logs.fieldMap.value.primaryGroupBy
      const serviceChip = ctx.semantics.logs.fieldMap.value.service
      const chipKeys = new Set([groupCol, serviceChip, 'service'].filter(Boolean) as string[])
      const match = ctx.query.filters.value.find((f) => f.op === '=' && chipKeys.has(f.key))
      ctx.ui.logsSelectedGroup.value = match?.value
    } else {
      ctx.ui.logsSelectedGroup.value = undefined
    }

    if (ctx.connection.signal.value === 'logs' && ctx.ui.logsView.value === 'detail') {
      const opRaw = typeof bodyOp === 'string' ? bodyOp : ''
      ctx.ui.logsBodyOp.value = isLogsBodyOp(opRaw) ? opRaw : DEFAULT_LOGS_BODY_OP
      ctx.ui.logsBodyValue.value = typeof body === 'string' ? body : ''
    } else {
      ctx.ui.logsBodyOp.value = DEFAULT_LOGS_BODY_OP
      ctx.ui.logsBodyValue.value = ''
    }

    // Drawers via open/close actions (overlay bind side effects), not raw ref writes.
    const canShowTraceDrawers = ctx.connection.signal.value === 'traces' || ctx.connection.signal.value === 'logs'
    const logsTraceFromUrl = typeof logsTraceId === 'string' ? logsTraceId.trim() : ''
    if (logsTraceFromUrl && canShowTraceDrawers) {
      ctx.actions.openLogsForTrace(logsTraceFromUrl)
    } else {
      ctx.actions.closeLogsForTrace()
    }

    const traceIdFromUrl = typeof focusTraceId === 'string' ? focusTraceId.trim() : ''
    if (traceIdFromUrl && canShowTraceDrawers) {
      ctx.actions.openTraceGantt(traceIdFromUrl)
    } else {
      ctx.actions.closeTraceGantt()
    }

    normalizeTimeRange(ctx)
    finishSyncingFromUrl(pendingBinds)
  }

  const initializeFromQuery = () => {
    applyQueryToContext(route.query)
  }

  const buildQueryFromContext = (): Record<string, string | string[]> => {
    const query: Record<string, string | string[]> = {}

    if (ctx.query.rangeTime.value.length === 2) {
      query.timeRange = ctx.query.rangeTime.value.map(String)
    } else if (ctx.query.time.value > 0) {
      query.timeLength = String(ctx.query.time.value)
    }

    const filtersParam = serializeFilters(ctx.query.filters.value)
    if (filtersParam) {
      query.filters = filtersParam
    }

    const prefixesParam = serializeCsv(ctx.query.sidebarFilters.value.prefixes)
    if (prefixesParam) {
      query.prefixes = prefixesParam
    }

    const suffixesParam = serializeCsv(ctx.query.sidebarFilters.value.suffixes)
    if (suffixesParam) {
      query.suffixes = suffixesParam
    }

    if (ctx.connection.signal.value !== 'metrics') {
      query.signal = ctx.connection.signal.value
    }

    if (ctx.ui.metric.value) {
      query.metric = ctx.ui.metric.value
    }

    if (ctx.semantics.logs.table.value) {
      query.logsTable = ctx.semantics.logs.table.value
    }

    if (ctx.semantics.traces.table.value) {
      query.tracesTable = ctx.semantics.traces.table.value
    }

    if (
      (ctx.connection.signal.value === 'traces' || ctx.connection.signal.value === 'logs') &&
      ctx.ui.focusTraceId.value
    ) {
      query.focusTraceId = ctx.ui.focusTraceId.value
    }

    if (
      (ctx.connection.signal.value === 'traces' || ctx.connection.signal.value === 'logs') &&
      ctx.ui.logsTraceId.value
    ) {
      query.logsTraceId = ctx.ui.logsTraceId.value
    }

    if (ctx.connection.signal.value === 'logs' && ctx.ui.logsView.value === 'detail') {
      query.logsView = 'detail'
      const bodyValue = ctx.ui.logsBodyValue.value.trim()
      const bodyActive = Boolean(bodyValue) || !logsBodyOpNeedsValue(ctx.ui.logsBodyOp.value)
      if (bodyActive) {
        query.bodyOp = ctx.ui.logsBodyOp.value
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
    () => [ctx.query.time.value, ctx.query.rangeTime.value[0], ctx.query.rangeTime.value[1]],
    () => {
      if (syncingFromUrl) {
        return
      }
      normalizeTimeRange(ctx)
    }
  )

  watch(
    () => [
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.filters.value,
      ctx.query.sidebarFilters.value,
      ctx.connection.signal.value,
      ctx.ui.metric.value,
      ctx.semantics.logs.table.value,
      ctx.ui.logsView.value,
      ctx.ui.logsBodyOp.value,
      ctx.ui.logsBodyValue.value,
      ctx.semantics.traces.table.value,
      ctx.ui.focusTraceId.value,
      ctx.ui.logsTraceId.value,
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
