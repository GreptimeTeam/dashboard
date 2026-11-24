import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LOGS_QUERY_STORAGE_KEY,
  TRACES_QUERY_STORAGE_KEY,
  readLastQueryTable,
  readQueryTable,
  writeQueryTable,
} from './query-table-pref'

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

  // Code mode may parse a qualified table ref; every writer must store the same bare shape,
  // since the cross-signal links use the stored value directly.
  it('stores the bare table name', () => {
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', '"public"."opentelemetry_traces_v2"')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBe('opentelemetry_traces_v2')

    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'prod', 'prod.spans')
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'prod')).toBe('spans')
  })

  // What the cross-signal links read: the page's own latest query, database included, so a
  // code-mode query against another database cannot resolve to a stale per-database entry.
  it('exposes the last queried database and table', () => {
    expect(readLastQueryTable(TRACES_QUERY_STORAGE_KEY)).toBeUndefined()

    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    expect(readLastQueryTable(TRACES_QUERY_STORAGE_KEY)).toEqual({ database: 'public', table: 'spans' })

    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'otel', 'otel.traces_v2')
    expect(readLastQueryTable(TRACES_QUERY_STORAGE_KEY)).toEqual({ database: 'otel', table: 'traces_v2' })
    // The per-database memory is untouched by the latest-query pointer.
    expect(readQueryTable(TRACES_QUERY_STORAGE_KEY, 'public')).toBe('spans')
  })

  it('drops the last query when the host changed or the record is corrupt', () => {
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, 'public', 'spans')
    app.host = 'http://other'
    expect(readLastQueryTable(TRACES_QUERY_STORAGE_KEY)).toBeUndefined()

    app.host = 'http://primary'
    storage.set(`${TRACES_QUERY_STORAGE_KEY}:selected-table`, '{not json')
    expect(readLastQueryTable(TRACES_QUERY_STORAGE_KEY)).toBeUndefined()
  })
})
