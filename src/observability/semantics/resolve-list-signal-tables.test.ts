import { beforeEach, describe, expect, it, vi } from 'vitest'
import useTableSchemaStore from '@/store/modules/table-schema'
import { listSignalTables, resolveSignalTable } from './resolve'
import { getTableSemantics, listBySignal } from './source'

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
  if (table === 'custom_trace_id_table') {
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
  currentConnectionKey: () => '',
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
  vi.mocked(getTableSemantics).mockReset()
  vi.mocked(getTableSemantics).mockImplementation(async () => undefined)
})

describe('listSignalTables(traces) qualification', () => {
  it('returns declared trace tables first, then trace_id-scan tables — names only', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['opentelemetry_traces', 'partial_traces']))

    const tables = await listSignalTables('traces', { database: 'public' })

    // No columns query at discovery time: the scan already guarantees trace_id, and
    // full-model ranking is deferred to resolveSignalTable (auto-bind) only.
    expect(tables).toEqual(['opentelemetry_traces', 'partial_traces'])
  })

  it('keeps include entries — they are explicit user choices', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces']))

    const tables = await listSignalTables('traces', {
      database: 'public',
      include: ['metrics_x'],
    })

    // No default-name injection and no columns-based dropping: include is explicit.
    expect(tables).toEqual(['partial_traces', 'metrics_x'])
  })

  it('ranks a semantic trace declaration above an undeclared partial table', async () => {
    vi.mocked(listBySignal).mockImplementation(async () => [{ tableName: 'declared_traces' }])
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces']))

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables.indexOf('declared_traces')).toBeGreaterThan(tables.indexOf('opentelemetry_traces'))
    expect(tables.indexOf('declared_traces')).toBeLessThan(tables.indexOf('partial_traces'))
  })

  it('excludes tables declared as another signal from the trace_id scan', async () => {
    // A declared log table carrying trace_id is a logs candidate, never a traces one —
    // the declaration wins over the physical column signal.
    vi.mocked(getTableSemantics).mockImplementation(async (table: string) =>
      table === 'genai_conversations' ? { tableName: table, metadataQuality: 'declared', signalType: 'log' } : undefined
    )
    tablesHavingColumn.mockImplementation(async () => new Set(['genai_conversations', 'partial_traces']))

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables).toEqual(['partial_traces'])
    expect(tables).not.toContain('genai_conversations')
  })

  it('keeps undeclared trace_id tables — the escape hatch stays open', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['custom_trace_id_table']))

    const tables = await listSignalTables('traces', { database: 'public' })

    expect(tables).toEqual(['custom_trace_id_table'])
  })
})

describe('resolveSignalTable(traces) auto-bind', () => {
  it('ranks the full model first when no preferred/settings table exists', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces', 'opentelemetry_traces']))

    const bound = await resolveSignalTable('traces', { database: 'public' })

    expect(bound).toBe('opentelemetry_traces')
  })

  it('short-circuits on preferred without any schema batch', async () => {
    tablesHavingColumn.mockImplementation(async () => new Set(['partial_traces', 'opentelemetry_traces']))
    const { ensureTableSchemas } = vi.mocked(useTableSchemaStore())

    const bound = await resolveSignalTable('traces', {
      database: 'public',
      preferred: 'web_trace_demo',
    })

    expect(bound).toBe('web_trace_demo')
    expect(ensureTableSchemas).not.toHaveBeenCalled()
  })
})
