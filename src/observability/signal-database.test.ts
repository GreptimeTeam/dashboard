import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type Ref } from 'vue'

import { resetSignalDatabasesForTests, useSignalDatabase } from './signal-database'

vi.mock('@/store', () => ({
  useAppStore: () => ({ database: 'public' }),
}))

describe('useSignalDatabase', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
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
    expect(storage.get('signal-db:metrics')).toBe('prod')
  })
})
