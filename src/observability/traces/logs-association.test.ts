import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import useTableSchemaStore from '@/store/modules/table-schema'
import { getTableSemantics, listSignalTables, resolveEntityFilterRef } from '../semantics'
import { fetchTraceLogsRows, qualifyTraceLogsTable, resolveTraceLogsForServices } from './logs-association'

const loadDrilldownSettings = vi.hoisted(() => vi.fn())
const updateTracesDrilldownSettings = vi.hoisted(() => vi.fn())

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

const ensureTableSchema = vi.fn()

vi.mock('@/store/modules/table-schema', () => ({
  default: vi.fn(() => ({
    ensureTableSchema,
    ensureTableSchemas: vi.fn(async () => ({})),
  })),
}))

vi.mock('../semantics', () => ({
  getTableSemantics: vi.fn(),
  listSignalTables: vi.fn(),
  resolveEntityFilterRef: vi.fn(),
}))

vi.mock('../drilldown-settings', () => ({
  loadDrilldownSettings,
  updateTracesDrilldownSettings,
}))

const runSQL = vi.mocked(editorApi.runSQL)
const listTables = vi.mocked(listSignalTables)
const resolveServiceRef = vi.mocked(resolveEntityFilterRef)
const getSemantics = vi.mocked(getTableSemantics)

const OTelLogsColumns = [
  { name: 'timestamp', data_type: 'TimestampNanosecond' },
  { name: 'trace_id', data_type: 'String' },
  { name: 'body', data_type: 'String' },
  { name: 'service_name', data_type: 'String' },
]

const TraceModelColumns = [
  { name: 'timestamp', data_type: 'TimestampNanosecond' },
  { name: 'trace_id', data_type: 'String' },
  { name: 'parent_span_id', data_type: 'String' },
  { name: 'span_name', data_type: 'String' },
  { name: 'service_name', data_type: 'String' },
]

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    tracesDatabase: { value: 'trace_db' },
    logsDatabase: { value: 'logs_db' },
    logsTable: { value: 'current_logs' },
    unixTimeRange: () => [100, 200],
    ...overrides,
  } as any
}

function mockQualifiedTables(tables: string[]) {
  listTables.mockResolvedValue(tables)
  ensureTableSchema.mockImplementation(async (table: string) => {
    if (table === 'no_trace_logs') {
      return [
        { name: 'timestamp', data_type: 'TimestampNanosecond' },
        { name: 'body', data_type: 'String' },
      ]
    }
    if (table === '_gt_logs') {
      return [
        { name: 'timestamp', data_type: 'TimestampNanosecond' },
        { name: 'trace_id', data_type: 'String' },
        { name: 'pod', data_type: 'String' },
      ]
    }
    return OTelLogsColumns
  })
  resolveServiceRef.mockImplementation(async (table: string) =>
    table === '_gt_logs' ? undefined : { column: 'service_name' }
  )
}

/** runSQL hit helper: a probe "hits" when the SQL targets the given table. */
function mockProbeHits(hits: string[]) {
  runSQL.mockImplementation(async (sql: string) => ({
    output: [
      {
        records: {
          rows: hits.some((table) => sql.includes(`FROM "${table}"`)) ? [['1']] : [],
        },
      },
    ],
  }))
}

beforeEach(() => {
  ensureTableSchema.mockReset()
  runSQL.mockReset()
  listTables.mockReset()
  resolveServiceRef.mockReset()
  getSemantics.mockReset()
  updateTracesDrilldownSettings.mockReset()
  loadDrilldownSettings.mockReset()
  loadDrilldownSettings.mockReturnValue({ logs: {}, traces: {} })
  updateTracesDrilldownSettings.mockReturnValue({ logs: {}, traces: {} })
  getSemantics.mockResolvedValue(undefined)
  vi.mocked(useTableSchemaStore).mockReturnValue({
    ensureTableSchema,
    ensureTableSchemas: vi.fn(async () => ({})),
  } as any)
})

describe('trace logs routing', () => {
  it('prefers the manual service mapping without any discovery or probe', async () => {
    loadDrilldownSettings.mockReturnValue({
      logs: {},
      traces: {
        traceLogsMappings: [{ service: 'frontend', database: 'logging', table: 'frontend_v2', source: 'manual' }],
      },
    })

    const resolution = await resolveTraceLogsForServices(createContext(), ['frontend'])

    expect(resolution.targets.frontend).toEqual({
      service: 'frontend',
      database: 'logging',
      table: 'frontend_v2',
      source: 'manual',
    })
    expect(resolution.ambiguous).toEqual({})
    expect(listTables).not.toHaveBeenCalled()
    expect(runSQL).not.toHaveBeenCalled()
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('follows the Logs page binding when only one qualified table exists — no mappings, no probe', async () => {
    mockQualifiedTables(['otel_logs'])
    loadDrilldownSettings.mockReturnValue({
      logs: {},
      traces: {
        traceLogsMappings: [
          { service: 'checkout', database: 'logs_db', table: 'otel_logs', source: 'auto' },
          { service: 'cart', database: 'logging', table: 'cart_logs', source: 'manual' },
        ],
      },
    })

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout', 'cart', 'other'])

    // The single table carries no routing information: auto entries are dropped (kept
    // for cart's manual entry), everything else follows the Logs page binding.
    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(resolution.targets.cart).toEqual({
      service: 'cart',
      database: 'logging',
      table: 'cart_logs',
      source: 'manual',
    })
    expect(resolution.targets.other).toMatchObject({ table: 'current_logs', source: 'current' })
    expect(runSQL).not.toHaveBeenCalled()
    expect(updateTracesDrilldownSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        traceLogsMappings: [{ service: 'cart', database: 'logging', table: 'cart_logs', source: 'manual' }],
      }),
      'trace_db'
    )
  })

  it('clears single-table no-op mappings regardless of their source', async () => {
    // Legacy entries may have lost their source marker; pointing at the only qualified
    // table makes them equivalent to the Logs page binding, so they are still cleared.
    mockQualifiedTables(['otel_logs'])
    loadDrilldownSettings.mockReturnValue({
      logs: {},
      traces: {
        traceLogsMappings: [{ service: 'checkout', database: 'logs_db', table: 'otel_logs' }],
      },
    })

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(updateTracesDrilldownSettings).toHaveBeenCalledWith(
      expect.objectContaining({ traceLogsMappings: [] }),
      'trace_db'
    )
  })

  it('drops auto entries learned from another Logs database', async () => {
    mockQualifiedTables(['otel_logs', 'legacy_logs'])
    loadDrilldownSettings.mockReturnValue({
      logs: {},
      traces: {
        traceLogsMappings: [
          { service: 'stale', database: 'old_db', table: 'old_logs', source: 'auto' },
          { service: 'fresh', database: 'logs_db', table: 'otel_logs', source: 'auto' },
        ],
      },
    })
    mockProbeHits([])

    await resolveTraceLogsForServices(createContext(), ['stale'])

    expect(updateTracesDrilldownSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        traceLogsMappings: [{ service: 'fresh', database: 'logs_db', table: 'otel_logs', source: 'auto' }],
      }),
      'trace_db'
    )
  })

  it('probes qualified candidates by service value inside the trace window', async () => {
    mockQualifiedTables(['otel_logs', 'legacy_logs'])
    mockProbeHits(['legacy_logs'])

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'legacy_logs',
      source: 'auto',
    })
    const probeSql = runSQL.mock.calls.find((call) => String(call[0]).includes('FROM "legacy_logs"'))?.[0] as string
    expect(probeSql).toContain(`"service_name" = 'checkout'`)
    expect(probeSql).toContain('FROM_UNIXTIME(100)')
    expect(probeSql).toContain('LIMIT 1')
    expect(updateTracesDrilldownSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        traceLogsMappings: [{ service: 'checkout', database: 'logs_db', table: 'legacy_logs', source: 'auto' }],
      }),
      'trace_db'
    )
  })

  it('marks multi-table hits ambiguous and never guesses or learns', async () => {
    mockQualifiedTables(['otel_logs', 'legacy_logs'])
    mockProbeHits(['otel_logs', 'legacy_logs'])

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toBeUndefined()
    expect(resolution.ambiguous.checkout).toEqual(['otel_logs', 'legacy_logs'])
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('never re-learns a tombstoned service', async () => {
    mockQualifiedTables(['otel_logs', 'legacy_logs'])
    mockProbeHits(['otel_logs'])
    loadDrilldownSettings.mockReturnValue({ logs: {}, traces: { ignoredServiceKeys: ['checkout'] } })

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    // The probe still resolves this click, but the hit is not persisted.
    expect(resolution.targets.checkout).toMatchObject({ table: 'otel_logs', source: 'auto' })
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('falls back to the current Logs binding when nothing qualifies or matches', async () => {
    listTables.mockResolvedValue([])
    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('excludes tables declared as another signal (the traces table itself)', async () => {
    listTables.mockResolvedValue(['opentelemetry_logs', 'opentelemetry_traces'])
    ensureTableSchema.mockImplementation(async (table: string) =>
      table === 'opentelemetry_traces' ? TraceModelColumns : OTelLogsColumns
    )
    getSemantics.mockImplementation(async (table: string) =>
      table === 'opentelemetry_traces'
        ? ({ tableName: table, metadataQuality: 'declared', signalType: 'trace', source: 'opentelemetry' } as any)
        : undefined
    )
    loadDrilldownSettings.mockReturnValue({
      logs: {},
      traces: {
        traceLogsMappings: [{ service: 'checkout', database: 'logs_db', table: 'opentelemetry_logs', source: 'auto' }],
      },
    })

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout', 'other'])

    // The traces table is declared signal_type='trace', so a single qualified logs table
    // remains — routing follows the Logs page binding and the stale auto entry is pruned.
    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(resolution.targets.other).toMatchObject({ table: 'current_logs', source: 'current' })
    // Declared non-log tables are rejected before their schema is even fetched.
    expect(ensureTableSchema).not.toHaveBeenCalledWith('opentelemetry_traces', 'logs_db')
    expect(updateTracesDrilldownSettings).toHaveBeenCalledWith(
      expect.objectContaining({ traceLogsMappings: [] }),
      'trace_db'
    )
  })

  it('excludes trace-model-shaped tables even without a semantics declaration', async () => {
    listTables.mockResolvedValue(['opentelemetry_logs', 'trace_model_table'])
    ensureTableSchema.mockImplementation(async (table: string) =>
      table === 'trace_model_table' ? TraceModelColumns : OTelLogsColumns
    )

    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(runSQL).not.toHaveBeenCalled()
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('excludes undeclared span-shaped tables from probe candidates', async () => {
    // web_trace_demo-style table: trace_id + service identity but no semantics
    // declaration and no log-payload column — span shape alone must not qualify.
    listTables.mockResolvedValue(['opentelemetry_logs', 'web_trace_demo'])
    ensureTableSchema.mockImplementation(async (table: string) =>
      table === 'web_trace_demo' ? TraceModelColumns : OTelLogsColumns
    )

    const resolution = await resolveTraceLogsForServices(createContext(), ['frontend'])

    expect(resolution.targets.frontend).toEqual({
      service: 'frontend',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(runSQL).not.toHaveBeenCalled()
    expect(updateTracesDrilldownSettings).not.toHaveBeenCalled()
  })

  it('keeps the tables a probe can actually filter by trace (trace_id column required)', async () => {
    mockQualifiedTables(['otel_logs', 'no_trace_logs'])

    // `no_trace_logs` never qualifies, so a single qualified table remains — routing
    // follows the Logs page binding and no probe runs.
    const resolution = await resolveTraceLogsForServices(createContext(), ['checkout'])

    expect(resolution.targets.checkout).toEqual({
      service: 'checkout',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(runSQL).not.toHaveBeenCalled()
  })

  it('skips candidates without a resolvable service identity instead of probing them', async () => {
    mockQualifiedTables(['_gt_logs', 'otel_logs'])

    // `_gt_logs` resolves no service identity, leaving a single qualified table —
    // routing follows the Logs page binding and `_gt_logs` is never probed.
    const resolution = await resolveTraceLogsForServices(createContext(), ['frontend-web'])

    expect(resolution.targets['frontend-web']).toEqual({
      service: 'frontend-web',
      database: 'logs_db',
      table: 'current_logs',
      source: 'current',
    })
    expect(runSQL.mock.calls.every((call) => !String(call[0]).includes('"_gt_logs"'))).toBe(true)
  })
})

describe('trace logs table qualification', () => {
  it('flexibly qualifies a non-OTel logs table with trace_id but no service identity', async () => {
    getSemantics.mockResolvedValue(undefined)
    resolveServiceRef.mockResolvedValue(undefined)

    const result = await qualifyTraceLogsTable(
      'custom_logs',
      [
        { name: 'timestamp', data_type: 'TimestampNanosecond' },
        { name: 'trace_id', data_type: 'String' },
        { name: 'message', data_type: 'String' },
      ],
      'logs_db'
    )

    // Manual mapping only needs trace filtering — the missing service identity just
    // means the table can never be auto-probed.
    expect(result).toEqual({ identityExpr: undefined, timeColumn: 'timestamp' })
  })

  it('still rejects tables without logs evidence or trace filtering', async () => {
    getSemantics.mockResolvedValue(undefined)
    resolveServiceRef.mockResolvedValue({ column: 'service_name' })

    // No payload column and undeclared → not a logs table.
    expect(
      await qualifyTraceLogsTable('some_metrics', [{ name: 'timestamp' }, { name: 'value' }], 'logs_db')
    ).toBeUndefined()
    // Trace-model shape → the traces table itself.
    expect(await qualifyTraceLogsTable('opentelemetry_traces', TraceModelColumns, 'logs_db')).toBeUndefined()
  })
})

describe('trace logs query', () => {
  it('queries one target by the standard trace id column', async () => {
    ensureTableSchema.mockResolvedValue(OTelLogsColumns)
    runSQL.mockResolvedValue({
      output: [
        {
          records: {
            schema: {
              column_schemas: OTelLogsColumns,
            },
            rows: [['2025-01-01T00:00:00Z', 'trace-1', 'hello', 'frontend']],
          },
        },
      ],
    })

    const result = await fetchTraceLogsRows(createContext(), {
      target: { service: 'frontend', database: 'logs_db', table: 'frontend_logs', source: 'manual' },
      traceId: 'trace-1',
    })

    const [sql, database] = runSQL.mock.calls[0]
    expect(database).toBe('logs_db')
    expect(sql).toContain('FROM "frontend_logs"')
    expect(sql).toContain('"trace_id" = \'trace-1\'')
    expect(sql).toContain('"timestamp" >= FROM_UNIXTIME(100)')
    expect(result.traceAssociationReady).toBe(true)
    expect(result.data[0]).toMatchObject({ trace_id: 'trace-1', body: 'hello' })
  })

  it('returns empty rows without issuing SQL when no trace id column exists', async () => {
    ensureTableSchema.mockResolvedValue([
      { name: 'timestamp', data_type: 'TimestampNanosecond' },
      { name: 'message', data_type: 'String' },
    ])

    const result = await fetchTraceLogsRows(createContext(), {
      target: { service: 'legacy', database: 'logs_db', table: 'legacy_logs', source: 'manual' },
      traceId: 'trace-1',
    })

    expect(runSQL).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.traceAssociationReady).toBe(false)
  })
})
