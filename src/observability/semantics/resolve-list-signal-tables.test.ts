import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSignalTables } from './resolve'
import { listBySignal } from './source'

const MODEL_COLUMNS = [
  { name: 'timestamp' },
  { name: 'trace_id' },
  { name: 'parent_span_id' },
  { name: 'span_name' },
  { name: 'service_name' },
  { name: 'duration_nano' },
]

function schemaFor(table: string): Array<{ name: string }> {
  if (table === 'opentelemetry_traces') {
    return MODEL_COLUMNS
  }
  if (table === 'partial_traces') {
    return [{ name: 'timestamp' }, { name: 'trace_id' }, { name: 'duration_nano' }]
  }
  if (table === 'declared_traces') {
    return [{ name: 'timestamp' }, { name: 'trace_id' }]
  }
  return [{ name: 'value' }]
}

const tablesHavingColumn = vi.fn(async () => new Set<string>())

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
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

vi.mock('@/store/modules/table-schema', () => ({
  default: vi.fn(() => ({
    ensureTableSchemas: vi.fn(async () => ({})),
    ensureTableSchema: vi.fn(async (table: string) => schemaFor(table)),
    tablesHavingColumn,
  })),
}))

beforeEach(() => {
  tablesHavingColumn.mockReset()
  tablesHavingColumn.mockImplementation(async () => new Set<string>())
  vi.mocked(listBySignal).mockReset()
  vi.mocked(listBySignal).mockImplementation(async () => [])
})

describe('listSignalTables(traces) qualification', () => {
  it('keeps partial trace tables (trace_id only) but ranks the full model first', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['opentelemetry_traces', 'partial_traces']))

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables[0]).toBe('opentelemetry_traces')
    expect(tables).toContain('partial_traces')
    expect(tables.indexOf('partial_traces')).toBeGreaterThan(tables.indexOf('opentelemetry_traces'))
  })

  it('excludes tables without trace_id even when they come from include', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces']))

    const tables = await listSignalTables('traces', {
      database: 'public',
      include: ['metrics_x'],
    })

    expect(tables).toContain('partial_traces')
    expect(tables).toContain('opentelemetry_traces')
    expect(tables).not.toContain('metrics_x')
  })

  it('ranks a semantic trace declaration above an undeclared partial table', async () => {
    vi.mocked(listBySignal).mockImplementation(async () => [{ tableName: 'declared_traces' }])
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces']))

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables.indexOf('declared_traces')).toBeGreaterThan(tables.indexOf('opentelemetry_traces'))
    expect(tables.indexOf('declared_traces')).toBeLessThan(tables.indexOf('partial_traces'))
  })
})
