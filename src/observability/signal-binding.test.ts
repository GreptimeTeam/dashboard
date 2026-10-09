import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import type { DrilldownContext, SignalSemanticSnapshot } from './context'
import createDrilldownSession from './drilldown-session'

const inspectSignalTable = vi.hoisted(() => vi.fn())
const loadDrilldownSettings = vi.hoisted(() => vi.fn())
const updateLogsDrilldownSettings = vi.hoisted(() => vi.fn())
const updateTracesDrilldownSettings = vi.hoisted(() => vi.fn())

vi.mock('./semantics', () => ({
  inspectSignalTable,
  entityColumnFilterKey: (columnRef: { kind: string; column?: string; path?: string }) =>
    columnRef.kind === 'json' ? `${columnRef.column}.${columnRef.path}` : columnRef.column,
  physicalServiceColumn: (columnRef?: { kind: string; column?: string }) =>
    columnRef?.kind === 'column' ? columnRef.column : undefined,
  normalizeEntityFilters: (filters: unknown[]) => filters,
  logsServiceFilterCandidateKeys: () => new Set(['service']),
  resolveLogsDetailGroupFromFilters: () => undefined,
  resolveSignalTable: vi.fn(),
}))

vi.mock('./drilldown-settings', () => ({
  loadDrilldownSettings,
  updateLogsDrilldownSettings,
  updateTracesDrilldownSettings,
}))

vi.mock('./logs/field-map', () => ({
  otelLogsFieldDefaultsFromColumns: () => ({
    time: 'timestamp',
    body: 'body',
    severity: 'severity_text',
    service: 'service_name',
    primaryGroupBy: 'service_name',
    traceId: 'trace_id',
  }),
  buildLogsFieldMapFromColumns: (_columns: unknown, settings?: Record<string, string>) => ({
    time: settings?.time || 'timestamp',
    body: settings?.body || 'body',
    service: settings?.service || 'service_name',
  }),
  isLogsRoleValue: (value: string | undefined, columns: Set<string>) =>
    Boolean(value && columns.has(value?.trim() || '')),
}))

vi.mock('./traces/field-map', () => ({
  buildDefaultTracesFieldMap: (opts?: { serviceColumn?: string }) => ({
    time: 'timestamp',
    service: opts?.serviceColumn || 'service_name',
  }),
}))

vi.mock('./filters', () => ({
  isDrilldownFilterOp: (value: string) => ['=', '!=', '=~', '!~', '>', '>=', '<', '<='].includes(value),
}))

vi.mock('./context', () => ({
  DRILLDOWN_DEFAULT_TIME_MINUTES: 30,
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onMounted: (fn: () => void) => fn(),
    watch: () => undefined,
  }
})

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
      revision.value += 1
    },
    setFieldMap: (next: Record<string, string>) => {
      fieldMap.value = next
      revision.value += 1
    },
    setEntityFilterKey: () => undefined,
    setColumns: () => undefined,
    setColumnTypes: () => undefined,
    applyInspection: () => undefined,
    commit: (next: {
      database: string
      table: string
      fieldMap: Record<string, string>
      inspection: { columns: Array<{ name: string }>; serviceRef?: { kind: string; column?: string } }
    }) => {
      database.value = next.database
      table.value = next.table
      fieldMap.value = next.fieldMap
      if (!next.inspection.columns.length) {
        entityFilterKeys.value = {}
        columns.value = undefined
        columnTypes.value = undefined
      } else {
        entityFilterKeys.value = next.inspection.serviceRef?.column
          ? { service: next.inspection.serviceRef.column }
          : {}
        columns.value = next.inspection.columns.map((c) => c.name)
        columnTypes.value = Object.fromEntries(next.inspection.columns.map((c) => [c.name, '']))
      }
      revision.value += 1
    },
    takeSnapshot: (): SignalSemanticSnapshot => ({
      database: database.value,
      table: table.value,
      fieldMap: { ...fieldMap.value },
      entityFilterKeys: { ...entityFilterKeys.value },
      columns: columns.value ? [...columns.value] : undefined,
      columnTypes: columnTypes.value ? { ...columnTypes.value } : undefined,
    }),
    restoreSnapshot: (snap: SignalSemanticSnapshot) => {
      database.value = snap.database
      table.value = snap.table
      fieldMap.value = { ...snap.fieldMap }
      entityFilterKeys.value = { ...snap.entityFilterKeys }
      columns.value = snap.columns ? [...snap.columns] : undefined
      columnTypes.value = snap.columnTypes ? { ...snap.columnTypes } : undefined
      revision.value += 1
    },
    reset: () => {
      database.value = undefined
      table.value = undefined
      fieldMap.value = {}
      entityFilterKeys.value = {}
      columns.value = undefined
      columnTypes.value = undefined
      revision.value += 1
    },
  }
}

function createCtx() {
  const logs = createSemantics()
  const traces = createSemantics()
  const logsDatabase = ref('public')
  const tracesDatabase = ref('public')
  const actions = {
    setFilters: vi.fn(),
    bindTable: async () => undefined,
    openLogsForTrace: () => undefined,
    closeLogsForTrace: () => undefined,
  }
  return {
    connection: {
      signal: ref('logs' as const),
      metricsDatabase: ref('public'),
      logsDatabase,
      tracesDatabase,
      databaseFor: (signal: 'logs' | 'traces') => (signal === 'logs' ? logsDatabase.value : tracesDatabase.value),
    },
    query: {
      filters: ref([]),
      sidebarFilters: ref({ prefixes: [], suffixes: [], groupBy: 'none' as const }),
      time: ref(30),
      rangeTime: ref<string[]>([]),
      unixTimeRange: () => [],
      resetTimeRange: () => undefined,
      refreshKey: ref(0),
    },
    semantics: { logs, traces },
    ui: {
      metric: ref(undefined),
      detailTab: ref('breakdown' as const),
      focusTraceId: ref(undefined),
      logsTraceId: ref<string | undefined>(),
      logsView: ref('overview' as const),
      logsTab: ref('logs' as const),
      logsBodyOp: ref('contains' as const),
      logsBodyValue: ref(''),
      tracesTab: ref('breakdown' as const),
      logsSelectedGroup: ref(undefined),
    },
    actions,
    session: createDrilldownSession(),
  } as unknown as DrilldownContext & { connection: { logsDatabase: typeof logsDatabase } }
}

describe('useSignalBinding', () => {
  beforeEach(() => {
    inspectSignalTable.mockReset()
    loadDrilldownSettings.mockReset()
    updateLogsDrilldownSettings.mockReset()
    updateTracesDrilldownSettings.mockReset()
    loadDrilldownSettings.mockReturnValue({ logs: {}, traces: {} })
    inspectSignalTable.mockResolvedValue({
      columns: [
        { name: 'timestamp', data_type: 'TimestampNanosecond' },
        { name: 'body', data_type: 'String' },
        { name: 'service_name', data_type: 'String' },
      ],
      serviceRef: { kind: 'column', column: 'service_name' },
    })
  })

  it('commit bumps revision once and overlay never writes connection.logsDatabase', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)
    const beforeDb = ctx.connection.logsDatabase.value

    await binding.bindTable('logs', 'opentelemetry_logs', { persist: false })
    expect(ctx.semantics.logs.revision.value).toBe(1)
    expect(ctx.semantics.logs.table.value).toBe('opentelemetry_logs')
    expect(ctx.semantics.logs.database.value).toBe('public')

    ctx.connection.logsDatabase.value = 'public'
    binding.openLogsForTrace('abc123', { database: 'other_db', table: 'service_logs' })
    expect(ctx.ui.logsTraceId.value).toBe('abc123')
    expect(ctx.connection.logsDatabase.value).toBe(beforeDb)
    expect(ctx.session.overlayLogs.active).toBe(true)
    expect(ctx.session.overlayLogs.targetTable).toBe('service_logs')
    expect(ctx.session.overlayLogs.pageSnapshot?.table).toBe('opentelemetry_logs')

    // Allow async overlay bind to settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(ctx.connection.logsDatabase.value).toBe(beforeDb)
    expect(inspectSignalTable).toHaveBeenCalledWith('logs', 'service_logs', 'other_db')
    expect(ctx.semantics.logs.table.value).toBe('service_logs')

    // Close restores the page binding and clears the overlay runtime.
    binding.closeLogsForTrace()
    expect(ctx.semantics.logs.table.value).toBe('opentelemetry_logs')
    expect(ctx.session.overlayLogs.active).toBe(false)
    expect(ctx.session.overlayLogs.targetTable).toBeUndefined()
    expect(ctx.session.overlayLogs.pageSnapshot).toBeUndefined()
  })

  it('rolls back overlay markers when the overlay bind fails', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)

    await binding.bindTable('logs', 'opentelemetry_logs', { persist: false })
    inspectSignalTable.mockRejectedValueOnce(new Error('inspect failed'))

    binding.openLogsForTrace('abc123', { database: 'other_db', table: 'service_logs' })
    expect(ctx.session.overlayLogs.active).toBe(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(ctx.semantics.logs.table.value).toBe('opentelemetry_logs')
    expect(ctx.session.overlayLogs.active).toBe(false)
    expect(ctx.session.overlayLogs.targetTable).toBeUndefined()
    expect(ctx.session.overlayLogs.pageSnapshot).toBeUndefined()
  })

  it('defers a hydrate overlay open until the page binding initializes', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    loadDrilldownSettings.mockReturnValue({ logs: { table: 'page_logs' }, traces: {} })
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)
    // mocked onMounted already ran initialize; let the async page bind settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(ctx.semantics.logs.table.value).toBe('page_logs')
    updateLogsDrilldownSettings.mockClear()
    inspectSignalTable.mockClear()

    // Simulate a hydrate that arrived before the binder was ready.
    ctx.session.binding.ready = false
    binding.openLogsForTrace('t1', { table: 'overlay_logs' })
    expect(inspectSignalTable).not.toHaveBeenCalledWith('logs', 'overlay_logs', 'public')
    expect(ctx.session.overlayLogs.pending).toEqual({ traceId: 't1', database: undefined, table: 'overlay_logs' })
    expect(ctx.session.overlayLogs.targetTable).toBe('overlay_logs')

    // initialize flushes the queue after the (skipped, identical) page bind.
    await binding.initialize('logs')
    expect(inspectSignalTable).toHaveBeenCalledWith('logs', 'overlay_logs', 'public')
    expect(ctx.semantics.logs.table.value).toBe('overlay_logs')
    expect(ctx.session.overlayLogs.active).toBe(true)
    expect(ctx.session.overlayLogs.pending).toBeUndefined()
    // The page bind already persisted above; the overlay bind must not.
    expect(updateLogsDrilldownSettings).not.toHaveBeenCalled()
  })

  it('discards stale generation when a newer bind starts', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)

    let resolveFirst!: (value: unknown) => void
    const first = new Promise((resolve) => {
      resolveFirst = resolve
    })
    inspectSignalTable
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({
        columns: [{ name: 'timestamp', data_type: 'TimestampNanosecond' }],
        serviceRef: { kind: 'column', column: 'service_name' },
      })

    const slow = binding.bindTable('logs', 'table_a', { persist: false })
    const fast = binding.bindTable('logs', 'table_b', { persist: false })
    await fast
    resolveFirst({
      columns: [{ name: 'old', data_type: 'String' }],
      serviceRef: { kind: 'column', column: 'service_name' },
    })
    await slow

    expect(ctx.semantics.logs.table.value).toBe('table_b')
    expect(ctx.semantics.logs.columns.value).toEqual(['timestamp'])
  })

  it('keeps shared filters that do not apply to the newly bound table', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)
    const metricOnlyFilter = { key: 'job', op: '=' as const, value: 'checkout' }
    ctx.query.filters.value = [metricOnlyFilter]

    await binding.bindTable('logs', 'opentelemetry_logs', { persist: false })

    expect(ctx.query.filters.value).toEqual([metricOnlyFilter])
    expect(ctx.actions.setFilters).not.toHaveBeenCalled()
  })

  it('prefers URL/current logs table over persisted settings on initialize', async () => {
    const { default: useSignalBinding } = await import('./signal-binding')
    const { resolveSignalTable } = await import('./semantics')
    vi.mocked(resolveSignalTable).mockClear()
    loadDrilldownSettings.mockReturnValue({
      logs: { table: 'settings_logs' },
      traces: { table: 'settings_traces' },
    })
    const ctx = createCtx()
    ctx.semantics.logs.setTable('url_logs')
    ctx.semantics.traces.setTable('url_traces')

    // onMounted initialize runs immediately (vue mock); URL/current must beat settings.
    useSignalBinding(ctx)
    await Promise.resolve()
    await Promise.resolve()

    expect(ctx.semantics.logs.table.value).toBe('url_logs')
    expect(ctx.semantics.traces.table.value).toBe('url_traces')
    expect(resolveSignalTable).not.toHaveBeenCalled()
  })

  it('keeps a Metrics filter restored from a URL after background logs binding', async () => {
    const [{ default: useSignalBinding }, { default: useDrilldownUrlSync }] = await Promise.all([
      import('./signal-binding'),
      import('./use-drilldown-url-sync'),
    ])
    const ctx = createCtx()
    const binding = useSignalBinding(ctx)
    const urlFilter = encodeURIComponent(JSON.stringify([{ key: 'job', op: '=', value: 'checkout' }]))

    Object.assign(ctx.actions, {
      setSignal: (signal: 'metrics' | 'logs' | 'traces', _options?: { hydrate?: boolean }) => {
        ctx.connection.signal.value = signal
      },
      setFilters: (filters: unknown[]) => {
        ctx.query.filters.value = filters as []
      },
      setSidebarFilters: () => undefined,
      setDetailTab: () => undefined,
      setLogsView: () => undefined,
      setLogsTab: () => undefined,
      setTracesTab: () => undefined,
      openLogsForTrace: () => undefined,
      closeLogsForTrace: () => undefined,
      openTraceGantt: () => undefined,
      closeTraceGantt: () => undefined,
    })

    const urlSync = useDrilldownUrlSync(
      ctx,
      { query: { signal: 'metrics', filters: urlFilter } } as never,
      { push: vi.fn(), replace: vi.fn() } as never
    )
    urlSync.initializeFromQuery()
    await nextTick()
    expect(ctx.connection.signal.value).toBe('metrics')
    expect(ctx.query.filters.value).toEqual([{ key: 'job', op: '=', value: 'checkout' }])

    await binding.bindTable('logs', 'opentelemetry_logs', { persist: false })

    expect(ctx.query.filters.value).toEqual([{ key: 'job', op: '=', value: 'checkout' }])
  })
})
