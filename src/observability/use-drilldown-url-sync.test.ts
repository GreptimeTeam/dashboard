import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import type { DrilldownContext } from './context'
import createDrilldownSession from './drilldown-session'

vi.mock('./filters', () => ({
  isDrilldownFilterOp: (value: string) => ['=', '!=', '=~', '!~', '>', '>=', '<', '<='].includes(value),
}))

vi.mock('./context', () => ({
  DRILLDOWN_DEFAULT_TIME_MINUTES: 30,
}))

function createSemantics() {
  const database = ref<string | undefined>()
  const table = ref<string | undefined>()
  const fieldMap = ref<Record<string, string>>({})
  const entityFilterKeys = ref<Record<string, string>>({})
  const columns = ref<string[] | undefined>()
  const columnTypes = ref<Record<string, string> | undefined>()
  const revision = ref(0)
  const ready = computed(() => Boolean(table.value && columns.value?.length))

  return {
    database,
    table,
    fieldMap,
    entityFilterKeys,
    columns,
    columnTypes,
    revision,
    ready,
    setTable: (next: string | undefined) => {
      table.value = next
    },
    setFieldMap: () => undefined,
    setEntityFilterKey: () => undefined,
    setColumns: () => undefined,
    setColumnTypes: () => undefined,
    applyInspection: () => undefined,
    commit: () => undefined,
    takeSnapshot: () => ({
      database: database.value,
      table: table.value,
      fieldMap: { ...fieldMap.value },
      entityFilterKeys: { ...entityFilterKeys.value },
      columns: columns.value ? [...columns.value] : undefined,
      columnTypes: columnTypes.value ? { ...columnTypes.value } : undefined,
    }),
    restoreSnapshot: () => undefined,
    reset: () => undefined,
  }
}

function createCtx() {
  const logs = createSemantics()
  const traces = createSemantics()
  const signal = ref<'metrics' | 'logs' | 'traces'>('metrics')
  const filters = ref<Array<{ key: string; op: string; value: string }>>([])
  const logsView = ref<'overview' | 'detail'>('overview')
  const logsTraceId = ref<string | undefined>()
  const focusTraceId = ref<string | undefined>()
  const logsSelectedGroup = ref<string | undefined>()
  const logsBodyOp = ref('contains')
  const logsBodyValue = ref('')
  const metric = ref<string | undefined>()
  const detailTab = ref('breakdown')
  const logsTab = ref('logs')
  const tracesTab = ref('breakdown')
  const time = ref(30)
  const rangeTime = ref<string[]>([])

  const setSignal = vi.fn((next: 'metrics' | 'logs' | 'traces', options?: { hydrate?: boolean }) => {
    if (!options?.hydrate) {
      // Mimic destructive UI path for assertions that call without hydrate.
      logsTraceId.value = undefined
      focusTraceId.value = undefined
      logsView.value = 'overview'
    }
    if (next !== 'metrics') {
      metric.value = undefined
    }
    signal.value = next
  })
  const openLogsForTrace = vi.fn((traceId: string) => {
    logsTraceId.value = traceId.trim()
  })
  const closeLogsForTrace = vi.fn(() => {
    logsTraceId.value = undefined
  })
  const openTraceGantt = vi.fn((traceId: string) => {
    focusTraceId.value = traceId.trim()
  })
  const closeTraceGantt = vi.fn(() => {
    focusTraceId.value = undefined
  })
  const bindTable = vi.fn(async () => undefined)
  const setFilters = vi.fn((next: typeof filters.value) => {
    filters.value = next
  })
  const setSidebarFilters = vi.fn()
  const setLogsView = vi.fn((view: 'overview' | 'detail') => {
    logsView.value = view
  })
  const setLogsTab = vi.fn((tab: string) => {
    logsTab.value = tab as typeof logsTab.value
  })
  const setTracesTab = vi.fn((tab: string) => {
    tracesTab.value = tab as typeof tracesTab.value
  })
  const setDetailTab = vi.fn((tab: string) => {
    detailTab.value = tab as typeof detailTab.value
  })

  return {
    connection: {
      signal,
      metricsDatabase: ref('public'),
      logsDatabase: ref('public'),
      tracesDatabase: ref('public'),
      databaseFor: () => 'public',
    },
    query: {
      filters,
      sidebarFilters: ref({ prefixes: [], suffixes: [], groupBy: 'none' as const }),
      time,
      rangeTime,
      unixTimeRange: () => [],
      resetTimeRange: () => undefined,
      refreshKey: ref(0),
    },
    semantics: { logs, traces },
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
    actions: {
      setSignal,
      setFilters,
      setSidebarFilters,
      setDetailTab,
      setLogsView,
      setLogsTab,
      setTracesTab,
      openLogsForTrace,
      closeLogsForTrace,
      openTraceGantt,
      closeTraceGantt,
      bindTable,
    },
    session: createDrilldownSession(),
  } as unknown as DrilldownContext & {
    actions: {
      setSignal: typeof setSignal
      openLogsForTrace: typeof openLogsForTrace
      closeLogsForTrace: typeof closeLogsForTrace
      openTraceGantt: typeof openTraceGantt
      closeTraceGantt: typeof closeTraceGantt
      bindTable: typeof bindTable
      setFilters: typeof setFilters
      setLogsView: typeof setLogsView
    }
  }
}

describe('useDrilldownUrlSync', () => {
  it('hydrates with soft setSignal and restores logsTrace drawer via openLogsForTrace', async () => {
    const { default: useDrilldownUrlSync } = await import('./use-drilldown-url-sync')
    const ctx = createCtx()
    // Simulate an open Trace→Logs overlay before a same-signal URL re-apply (Back).
    ctx.ui.logsTraceId.value = 'abc'
    ctx.connection.signal.value = 'logs'

    const urlSync = useDrilldownUrlSync(
      ctx,
      { query: { signal: 'logs', logsTraceId: 'abc', logsTable: 'service_logs' } } as never,
      { push: vi.fn(), replace: vi.fn() } as never
    )
    urlSync.initializeFromQuery()
    await nextTick()

    expect(ctx.actions.setSignal).toHaveBeenCalledWith('logs', { hydrate: true })
    expect(ctx.actions.closeLogsForTrace).not.toHaveBeenCalled()
    expect(ctx.actions.openLogsForTrace).toHaveBeenCalledWith('abc')
    expect(ctx.ui.logsTraceId.value).toBe('abc')
    expect(ctx.semantics.logs.table.value).toBe('service_logs')
  })

  it('closes logsTrace drawer when URL no longer has logsTraceId', async () => {
    const { default: useDrilldownUrlSync } = await import('./use-drilldown-url-sync')
    const ctx = createCtx()
    ctx.connection.signal.value = 'logs'
    ctx.ui.logsTraceId.value = 'abc'

    const urlSync = useDrilldownUrlSync(
      ctx,
      { query: { signal: 'logs' } } as never,
      { push: vi.fn(), replace: vi.fn() } as never
    )
    urlSync.initializeFromQuery()
    await nextTick()

    expect(ctx.actions.closeLogsForTrace).toHaveBeenCalled()
    expect(ctx.actions.openLogsForTrace).not.toHaveBeenCalled()
  })

  it('applies filters before logs detail view and restores focusTrace via openTraceGantt', async () => {
    const { default: useDrilldownUrlSync } = await import('./use-drilldown-url-sync')
    const ctx = createCtx()
    const urlFilter = encodeURIComponent(JSON.stringify([{ key: 'service_name', op: '=', value: 'checkout' }]))
    ctx.semantics.logs.fieldMap.value = { primaryGroupBy: 'service_name', service: 'service_name' }

    const urlSync = useDrilldownUrlSync(
      ctx,
      {
        query: {
          signal: 'logs',
          logsView: 'detail',
          filters: urlFilter,
          focusTraceId: 'trace-1',
        },
      } as never,
      { push: vi.fn(), replace: vi.fn() } as never
    )
    urlSync.initializeFromQuery()
    await nextTick()

    expect(ctx.actions.setFilters).toHaveBeenCalledWith([{ key: 'service_name', op: '=', value: 'checkout' }])
    expect(ctx.actions.setLogsView).toHaveBeenCalledWith('detail')
    expect(ctx.ui.logsSelectedGroup.value).toBe('checkout')
    expect(ctx.actions.openTraceGantt).toHaveBeenCalledWith('trace-1')
    expect(ctx.actions.closeTraceGantt).not.toHaveBeenCalled()
  })

  it('a fresh page session stamps the URL table even after an earlier session was ready', async () => {
    const { default: useDrilldownUrlSync } = await import('./use-drilldown-url-sync')
    const previous = createCtx()
    previous.session.binding.ready = true
    previous.session.dispose()

    const ctx = createCtx()
    const urlSync = useDrilldownUrlSync(
      ctx,
      { query: { signal: 'logs', logsTable: 'from_url' } } as never,
      { push: vi.fn(), replace: vi.fn() } as never
    )
    urlSync.initializeFromQuery()
    await nextTick()

    expect(previous.session.binding.ready).toBe(false)
    expect(ctx.actions.bindTable).not.toHaveBeenCalled()
    expect(ctx.semantics.logs.table.value).toBe('from_url')
  })

  it('awaits URL-driven bindTable before clearing syncingFromUrl', async () => {
    const { default: useDrilldownUrlSync } = await import('./use-drilldown-url-sync')
    const ctx = createCtx()
    ctx.session.binding.ready = true
    let resolveBind: (() => void) | undefined
    const bindPromise = new Promise<void>((resolve) => {
      resolveBind = resolve
    })
    ctx.actions.bindTable.mockReturnValue(bindPromise)

    const replace = vi.fn()
    const urlSync = useDrilldownUrlSync(
      ctx,
      { query: { signal: 'logs', logsTable: 'from_url' } } as never,
      { push: vi.fn(), replace } as never
    )
    urlSync.initializeFromQuery()

    // While bind is in flight, a context mutation must not write the URL.
    ctx.ui.logsView.value = 'detail'
    await nextTick()
    expect(replace).not.toHaveBeenCalled()
    expect(ctx.actions.bindTable).toHaveBeenCalledWith('logs', 'from_url', { persist: false })

    resolveBind?.()
    await bindPromise
    await nextTick()
    await nextTick()
  })
})
