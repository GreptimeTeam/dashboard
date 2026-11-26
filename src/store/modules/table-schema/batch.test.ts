import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import requestTableSchema, { requestTableSchemas } from '@/api/table-schema-fetch'
import useTableSchemaStore from './index'

vi.mock('@/api/table-schema-fetch', () => ({
  default: vi.fn(async () => []),
  requestTableSchemas: vi.fn(async () => ({})),
}))

vi.mock('../app', async () => {
  const { defineStore } = await import('pinia')
  const { computed, ref } = await import('vue')
  const useFakeAppStore = defineStore('fake-app', () => ({
    database: ref('public'),
    tableCatalog: computed(() => 'greptime'),
    tableSchema: computed(() => 'public'),
  }))
  const useAppStore = () => useFakeAppStore()
  return { useAppStore, default: useAppStore }
})

const requestTableSchemasMock = vi.mocked(requestTableSchemas)
const requestTableSchemaMock = vi.mocked(requestTableSchema)

beforeEach(() => {
  requestTableSchemasMock.mockReset()
  requestTableSchemaMock.mockReset()
  requestTableSchemasMock.mockResolvedValue({})
  setActivePinia(createPinia())
})

describe('table-schema store batch', () => {
  it('ensureTableSchemas fetches missing tables in ONE batched query', async () => {
    const store = useTableSchemaStore()
    requestTableSchemasMock.mockResolvedValue({
      a: [{ name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' }],
      b: [{ name: 'timestamp', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' }],
    })

    const result = await store.ensureTableSchemas(['a', 'b'], 'public')

    expect(requestTableSchemasMock).toHaveBeenCalledTimes(1)
    expect(Object.keys(result).sort()).toEqual(['a', 'b'])
    // Second call is served entirely from cache.
    await store.ensureTableSchemas(['a', 'b'], 'public')
    expect(requestTableSchemasMock).toHaveBeenCalledTimes(1)
  })

  it('concurrent single-table ensure joins the batch instead of duplicating', async () => {
    const store = useTableSchemaStore()
    requestTableSchemasMock.mockImplementation(async (tables: string[]) =>
      Object.fromEntries(
        tables.map((table) => [table, [{ name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' }]])
      )
    )

    // Batch starts first, then a per-table call races it.
    const batch = store.ensureTableSchemas(['a', 'b'], 'public')
    const single = store.ensureTableSchema('a', 'public')
    const [batchResult, singleResult] = await Promise.all([batch, single])

    expect(singleResult).toEqual([{ name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' }])
    // The per-table network fetch must never fire when the batch covers the table.
    expect(requestTableSchemaMock).not.toHaveBeenCalled()
    expect(requestTableSchemasMock).toHaveBeenCalledTimes(1)
    expect(batchResult.a).toBeDefined()
  })

  it('per-table ensureTableSchema issued before the batch is not re-fetched by it', async () => {
    const store = useTableSchemaStore()
    requestTableSchemaMock.mockResolvedValue([{ name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' }])

    const single = store.ensureTableSchema('a', 'public')
    const batch = store.ensureTableSchemas(['a', 'b'], 'public')
    await Promise.all([single, batch])

    // 'a' already has a per-table in-flight → the batch only covers 'b'.
    expect(requestTableSchemasMock).toHaveBeenCalledWith(['b'], expect.anything())
    expect(requestTableSchemaMock).toHaveBeenCalledTimes(1)
  })
})
