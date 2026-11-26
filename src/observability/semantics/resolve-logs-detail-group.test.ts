import { describe, expect, it, vi } from 'vitest'
import { resolveLogsDetailGroupFromFilters } from './resolve'

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

vi.mock('../current-database', () => ({
  currentDatabase: () => 'public',
  currentConnectionKey: () => 'host',
}))

describe('resolveLogsDetailGroupFromFilters', () => {
  const fieldMap = { primaryGroupBy: 'service_name', service: 'service_name' }
  const eq = (key: string, value: string) => ({ key, op: '=' as const, value })

  it('matches the primaryGroupBy / service role column', () => {
    expect(resolveLogsDetailGroupFromFilters([eq('service_name', 'checkout')], fieldMap)).toBe('checkout')
  })

  it('matches the canonical service alias and the table-resolved entity key', () => {
    expect(resolveLogsDetailGroupFromFilters([eq('service', 'billing')], {})).toBe('billing')
    expect(resolveLogsDetailGroupFromFilters([eq('k8s.deployment', 'web')], fieldMap, 'k8s.deployment')).toBe('web')
  })

  it('matches a JSON attribute chip key resolved from the entity', () => {
    const key = 'resource_attributes.service.name'
    expect(resolveLogsDetailGroupFromFilters([eq(key, 'checkout')], fieldMap, key)).toBe('checkout')
  })

  it('ignores non-equality ops and unknown keys', () => {
    expect(resolveLogsDetailGroupFromFilters([{ key: 'service_name', op: '!=', value: 'checkout' }], fieldMap)).toBe(
      undefined
    )
    expect(resolveLogsDetailGroupFromFilters([eq('host', 'node-1')], fieldMap)).toBe(undefined)
    expect(resolveLogsDetailGroupFromFilters([], fieldMap)).toBe(undefined)
  })
})
