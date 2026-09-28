import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import useTableSchemaStore from '@/store/modules/table-schema'
import { listSignalTables } from '../semantics'
import { fetchTraceLogsRows, resolveTraceLogsTargets } from './logs-association'

const loadDrilldownSettings = vi.hoisted(() => vi.fn())

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

vi.mock('@/store/modules/table-schema', () => ({
  default: vi.fn(() => ({
    ensureTableSchema: vi.fn(),
  })),
}))

vi.mock('../semantics', () => ({
  listSignalTables: vi.fn(),
}))

vi.mock('../drilldown-settings', () => ({
  loadDrilldownSettings,
}))

const ensureTableSchema = vi.fn()
const runSQL = vi.mocked(editorApi.runSQL)
const listTables = vi.mocked(listSignalTables)

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    tracesDatabase: { value: 'trace_db' },
    logsDatabase: { value: 'logs_db' },
    logsTable: { value: 'current_logs' },
    unixTimeRange: () => [100, 200],
    ...overrides,
  } as any
}

beforeEach(() => {
  ensureTableSchema.mockReset()
  runSQL.mockReset()
  listTables.mockReset()
  loadDrilldownSettings.mockReset()
  loadDrilldownSettings.mockReturnValue({ logs: {}, traces: {} })
  vi.mocked(useTableSchemaStore).mockReturnValue({
    ensureTableSchema,
  } as any)
})

describe('trace logs association', () => {
  it('prefers an explicit service mapping', async () => {
    loadDrilldownSettings.mockReturnValue({
      traces: {
        traceLogsMappings: [{ service: 'frontend', database: 'logging', table: 'frontend_v2' }],
      },
    })

    const targets = await resolveTraceLogsTargets(createContext(), ['frontend'])

    expect(targets).toEqual([{ service: 'frontend', database: 'logging', table: 'frontend_v2', source: 'explicit' }])
    expect(listTables).not.toHaveBeenCalled()
  })

  it('matches a service to a same-name logs table before the current logs fallback', async () => {
    listTables.mockResolvedValue(['current_logs', 'checkout'])
    const targets = await resolveTraceLogsTargets(createContext(), ['checkout', 'unknown'])

    expect(targets).toEqual([
      {
        service: 'checkout',
        database: 'logs_db',
        table: 'checkout',
        source: 'service',
      },
    ])
  })

  it('queries one target by the standard trace id column', async () => {
    ensureTableSchema.mockResolvedValue([
      { name: 'timestamp', data_type: 'TimestampNanosecond' },
      { name: 'trace_id', data_type: 'String' },
      { name: 'body', data_type: 'String' },
    ])
    runSQL.mockResolvedValue({
      output: [
        {
          records: {
            schema: {
              column_schemas: [
                { name: 'timestamp', data_type: 'TimestampNanosecond' },
                { name: 'trace_id', data_type: 'String' },
                { name: 'body', data_type: 'String' },
              ],
            },
            rows: [['2025-01-01T00:00:00Z', 'trace-1', 'hello']],
          },
        },
      ],
    })

    const result = await fetchTraceLogsRows(createContext(), {
      target: { service: 'frontend', database: 'logs_db', table: 'frontend_logs', source: 'explicit' },
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
      target: { service: 'legacy', database: 'logs_db', table: 'legacy_logs', source: 'explicit' },
      traceId: 'trace-1',
    })

    expect(runSQL).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.traceAssociationReady).toBe(false)
  })
})
