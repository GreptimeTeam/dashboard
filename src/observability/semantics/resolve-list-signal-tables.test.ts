import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import { listSignalTables } from './resolve'

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
    getTables: vi.fn(),
    getTableSchema: vi.fn(),
  },
}))

vi.mock('../current-database', () => ({
  currentDatabase: () => 'public',
}))

vi.mock('./source', () => ({
  listBySignal: vi.fn(async () => []),
  getTableSemantics: vi.fn(async () => undefined),
  getTableEntityDeclarations: vi.fn(async () => []),
  semanticsDump: vi.fn(async () => undefined),
}))

const runSQL = vi.mocked(editorApi.runSQL)
const getTables = vi.mocked(editorApi.getTables)
const getTableSchema = vi.mocked(editorApi.getTableSchema)

function sqlTablesResult(names: string[]) {
  return {
    output: [
      {
        records: {
          schema: { column_schemas: [{ name: 'table_name' }] },
          rows: names.map((name) => [name]),
        },
      },
    ],
  }
}

const MODEL_COLUMNS = [
  { name: 'timestamp' },
  { name: 'trace_id' },
  { name: 'parent_span_id' },
  { name: 'span_name' },
  { name: 'service_name' },
  { name: 'duration_nano' },
]

beforeEach(() => {
  runSQL.mockReset()
  getTables.mockReset()
  getTableSchema.mockReset()
})

describe('listSignalTables(traces) qualification', () => {
  it('keeps partial trace tables (trace_id only) but ranks the full model first', async () => {
    runSQL.mockResolvedValue(sqlTablesResult(['opentelemetry_traces', 'partial_traces']))
    getTableSchema.mockImplementation(async (table: string) => {
      if (table === 'opentelemetry_traces') {
        return MODEL_COLUMNS
      }
      if (table === 'partial_traces') {
        return [{ name: 'timestamp' }, { name: 'trace_id' }]
      }
      return []
    })

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables[0]).toBe('opentelemetry_traces')
    expect(tables).toContain('partial_traces')
    expect(tables.indexOf('partial_traces')).toBeGreaterThan(tables.indexOf('opentelemetry_traces'))
  })

  it('excludes tables without trace_id even when they come from include', async () => {
    runSQL.mockResolvedValue(sqlTablesResult(['partial_traces']))
    getTableSchema.mockImplementation(async (table: string) => {
      if (table === 'opentelemetry_traces') {
        return MODEL_COLUMNS
      }
      if (table === 'partial_traces') {
        return [{ name: 'timestamp' }, { name: 'trace_id' }]
      }
      return [{ name: 'value' }]
    })

    const tables = await listSignalTables('traces', {
      database: 'public',
      include: ['metrics_x'],
    })

    expect(tables).toContain('partial_traces')
    expect(tables).toContain('opentelemetry_traces')
    expect(tables).not.toContain('metrics_x')
  })
})
