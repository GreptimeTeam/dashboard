import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadDrilldownSettings, saveDrilldownSettings } from './drilldown-settings'

vi.mock('./current-database', () => ({
  currentDatabase: () => 'public',
  currentConnectionKey: () => 'http://primary',
}))

describe('drilldown settings storage', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stamps the host and database it was saved on', () => {
    saveDrilldownSettings({ logs: { table: 'app_logs' }, traces: {} }, 'public')
    expect(JSON.parse(storage.get('drilldown-settings') ?? '')).toMatchObject({
      v: 1,
      host: 'http://primary',
      database: 'public',
      logs: { table: 'app_logs' },
    })
  })

  it('reads only when both host and database match', () => {
    saveDrilldownSettings({ logs: { table: 'app_logs' }, traces: {} }, 'public')
    expect(loadDrilldownSettings('public').logs.table).toBe('app_logs')
    expect(loadDrilldownSettings('other').logs.table).toBeUndefined()

    const stored = JSON.parse(storage.get('drilldown-settings') ?? '')
    storage.set('drilldown-settings', JSON.stringify({ ...stored, host: 'http://other' }))
    expect(loadDrilldownSettings('public').logs.table).toBeUndefined()
  })

  it('adopts a legacy per-database key until the next save', () => {
    storage.set('drilldown-settings:public', JSON.stringify({ logs: { table: 'legacy_logs' }, traces: {} }))
    expect(loadDrilldownSettings('public').logs.table).toBe('legacy_logs')
  })
})
