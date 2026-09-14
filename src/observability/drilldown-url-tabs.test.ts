import { describe, expect, it, vi } from 'vitest'
import { readUrlTab, writeUrlTab, type DrilldownUrlTabSpec } from './drilldown-url-tabs'

function makeSpec(overrides?: Partial<DrilldownUrlTabSpec<'a' | 'b'>>): {
  spec: DrilldownUrlTabSpec<'a' | 'b'>
  getValue: () => 'a' | 'b'
} {
  let value: 'a' | 'b' = 'a'
  const spec: DrilldownUrlTabSpec<'a' | 'b'> = {
    queryKey: 'demoTab',
    defaultTab: 'a',
    isTab: (raw): raw is 'a' | 'b' => raw === 'a' || raw === 'b',
    get: () => value,
    set: (tab) => {
      value = tab
    },
    ...overrides,
  }
  return { spec, getValue: () => value }
}

describe('drilldown-url-tabs', () => {
  it('reads valid tab from query', () => {
    const { spec, getValue } = makeSpec()
    readUrlTab(spec, 'b')
    expect(getValue()).toBe('b')
  })

  it('resets to default on invalid query', () => {
    const { spec, getValue } = makeSpec()
    spec.set('b')
    readUrlTab(spec, 'nope')
    expect(getValue()).toBe('a')
  })

  it('resets when inactive', () => {
    const { spec, getValue } = makeSpec({ active: () => false })
    spec.set('b')
    readUrlTab(spec, 'b')
    expect(getValue()).toBe('a')
  })

  it('omits default tab from query write', () => {
    const { spec } = makeSpec()
    const query: Record<string, string | string[]> = {}
    writeUrlTab(query, spec)
    expect(query.demoTab).toBeUndefined()
    spec.set('b')
    writeUrlTab(query, spec)
    expect(query.demoTab).toBe('b')
  })

  it('skips write when inactive', () => {
    const active = vi.fn(() => false)
    const { spec } = makeSpec({ active })
    spec.set('b')
    const query: Record<string, string | string[]> = {}
    writeUrlTab(query, spec)
    expect(query.demoTab).toBeUndefined()
  })
})
