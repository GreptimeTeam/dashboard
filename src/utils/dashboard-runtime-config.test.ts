import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DASHBOARD_RUNTIME_GLOBAL_KEY,
  getDashboardRuntimeConfig,
  hasRuntimeDemoAuth,
  isRuntimeQueryGuideEnabled,
} from './dashboard-runtime-config'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDashboardRuntimeConfig', () => {
  it('returns null when window is missing or unset', () => {
    expect(getDashboardRuntimeConfig(undefined)).toBeNull()
    vi.stubGlobal('window', {})
    expect(getDashboardRuntimeConfig()).toBeNull()
  })

  it('reads the inject global', () => {
    const runtime = { username: 'greptime', password: 'demosession', queryGuide: true }
    vi.stubGlobal('window', { [DASHBOARD_RUNTIME_GLOBAL_KEY]: runtime })
    expect(getDashboardRuntimeConfig()).toEqual(runtime)
  })

  it('rejects non-object values', () => {
    vi.stubGlobal('window', { [DASHBOARD_RUNTIME_GLOBAL_KEY]: 'nope' })
    expect(getDashboardRuntimeConfig()).toBeNull()
  })
})

describe('runtime helpers', () => {
  it('detects demo auth only when both username and password are strings', () => {
    expect(hasRuntimeDemoAuth(null)).toBe(false)
    expect(hasRuntimeDemoAuth({ username: 'a' })).toBe(false)
    expect(hasRuntimeDemoAuth({ username: 'a', password: 'b' })).toBe(true)
  })

  it('detects queryGuide only when explicitly true', () => {
    expect(isRuntimeQueryGuideEnabled(null)).toBe(false)
    expect(isRuntimeQueryGuideEnabled({ queryGuide: false })).toBe(false)
    expect(isRuntimeQueryGuideEnabled({ queryGuide: true })).toBe(true)
  })
})
