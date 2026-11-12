import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type Ref } from 'vue'

import { getSignalDatabase, resetSignalDatabasesForTests, useSignalDatabase } from './signal-database'

const app = vi.hoisted(() => ({
  database: 'public',
  host: 'http://primary',
  databaseList: ['public', 'prod'],
}))

vi.mock('@/store', () => ({
  useAppStore: () => app,
}))

describe('useSignalDatabase', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    resetSignalDatabasesForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps persisting after the first caller scope is disposed', async () => {
    const firstCaller = effectScope()
    const fromExplore = firstCaller.run(() => useSignalDatabase('metrics')) as Ref<string>
    firstCaller.stop()

    const fromQueryPage = useSignalDatabase('metrics')
    expect(fromQueryPage).toBe(fromExplore)

    fromQueryPage.value = 'prod'
    await nextTick()
    expect(JSON.parse(storage.get('signal-db:metrics') ?? '')).toEqual({
      v: 1,
      host: 'http://primary',
      database: 'prod',
    })
  })

  it('ignores a DB stamped with another host', () => {
    storage.set('signal-db:metrics', JSON.stringify({ host: 'http://other', database: 'prod' }))
    expect(getSignalDatabase('metrics')).toBe('public')
  })

  it('adopts a legacy plain-string value', () => {
    storage.set('signal-db:metrics', 'prod')
    expect(getSignalDatabase('metrics')).toBe('prod')
  })

  it('falls back when the stored DB no longer exists', () => {
    storage.set('signal-db:metrics', JSON.stringify({ host: 'http://primary', database: 'dropped_db' }))
    expect(getSignalDatabase('metrics')).toBe('public')
  })
})
