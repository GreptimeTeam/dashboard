import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QUERY_GUIDE_STORAGE_KEY, isQueryGuideEnabled, syncQueryGuideFlagFromUrl } from './query-guide-enabled'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
  vi.stubGlobal('window', {
    location: { search: '', hash: '' },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('query guide URL + local sync', () => {
  it('defaults to disabled', () => {
    expect(isQueryGuideEnabled()).toBe(false)
  })

  it('enables and persists from search ?query_guide=1', () => {
    ;(window.location as { search: string }).search = '?query_guide=1'
    expect(isQueryGuideEnabled()).toBe(true)
    expect(store.get(QUERY_GUIDE_STORAGE_KEY)).toBe('1')
  })

  it('enables from hash-router query', () => {
    ;(window.location as { hash: string }).hash = '#/dashboard/query?query_guide=1'
    expect(isQueryGuideEnabled()).toBe(true)
    expect(store.get(QUERY_GUIDE_STORAGE_KEY)).toBe('1')
  })

  it('disables and clears from ?query_guide=0', () => {
    store.set(QUERY_GUIDE_STORAGE_KEY, '1')
    syncQueryGuideFlagFromUrl('?query_guide=0')
    expect(store.has(QUERY_GUIDE_STORAGE_KEY)).toBe(false)
    ;(window.location as { search: string }).search = ''
    expect(isQueryGuideEnabled()).toBe(false)
  })

  it('remembers prior enable without URL param', () => {
    store.set(QUERY_GUIDE_STORAGE_KEY, '1')
    expect(isQueryGuideEnabled()).toBe(true)
  })
})
