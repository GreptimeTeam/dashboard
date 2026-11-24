import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOGS_QUERY_STORAGE_KEY, TRACES_QUERY_STORAGE_KEY, readQueryTable, writeQueryTable } from './query-table-pref'

const app = vi.hoisted(() => ({ host: 'http://primary' }))

vi.mock('@/store', () => ({
  useAppStore: () => app,
}))

describe('query table preference', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    app.host = 'http://primary'
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('remembers the table per database', () => {
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'opentelemetry_traces_v2')
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'prod', 'spans')

    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBe('opentelemetry_traces_v2')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'prod')).toBe('spans')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'other')).toBeUndefined()
  })

  it('keeps the logs and traces builders independent', () => {
    writeQueryTable(LOGS_QUERY_STORAGE_KEY, 'public', 'opentelemetry_logs')

    expect(readQueryTable(LOGS_QUERY_STORAGE_KEY, 'public')).toBe('opentelemetry_logs')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBeUndefined()
  })

  it('ignores a preference stamped with another host', () => {
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    app.host = 'http://other'

    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBeUndefined()
  })

  it('does not write blank or unchanged values', () => {
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', '  ')
    expect(storage.size).toBe(0)

    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    const first = storage.get(`${TRACES_QUERY_STORAGE_KEY}:selected-table`)
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    expect(storage.get(`${TRACES_QUERY_STORAGE_KEY}:selected-table`)).toBe(first)
  })

  it('tolerates corrupt storage', () => {
    storage.set(`${TRACES_QUERY_STORAGE_KEY}:selected-table`, '{not json')

    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBeUndefined()
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBe('spans')
  })
})
