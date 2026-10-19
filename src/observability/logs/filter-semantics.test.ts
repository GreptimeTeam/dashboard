import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  claimOwnedLogsFilters,
  drilldownOpToLogsBodyOp,
  findOwnedLogsDetailFilter,
  isDirectLogsDetail,
  ownedLogsDetailFilterRole,
  removeOwnedLogsFilterVariants,
} from './filter-semantics'
import type { DrilldownFilter } from '../types'

vi.mock('../drilldown-settings', () => ({
  loadDrilldownSettings: () => ({ logs: {} }),
}))

const roles = {
  body: 'message',
  severity: 'severity_text',
  service: 'resource_attributes.service.name',
}

const baseOptions = {
  roles,
  entityServiceKey: 'resource_attributes.service.name',
}

describe('ownedLogsDetailFilterRole', () => {
  it('collapses body / severity / service spellings into the same owned role', () => {
    expect(ownedLogsDetailFilterRole('body', baseOptions)).toBe('body')
    expect(ownedLogsDetailFilterRole('message', baseOptions)).toBe('body')
    expect(ownedLogsDetailFilterRole('severity', baseOptions)).toBe('severity')
    expect(ownedLogsDetailFilterRole('severity_text', baseOptions)).toBe('severity')
    expect(ownedLogsDetailFilterRole('service', baseOptions)).toBe('service')
    expect(ownedLogsDetailFilterRole('resource_attributes.service.name', baseOptions)).toBe('service')
  })

  it('does not own unrelated keys', () => {
    expect(ownedLogsDetailFilterRole('host', baseOptions)).toBeUndefined()
  })
})

describe('claimOwnedLogsFilters', () => {
  const filters: DrilldownFilter[] = [
    { key: 'body', op: '=~', value: 'shared' },
    { key: 'severity', op: '=', value: 'WARN' },
    { key: 'severity_text', op: '=', value: 'ERROR' },
    { key: 'service', op: '=', value: 'canonical' },
    { key: 'resource_attributes.service.name', op: '=', value: 'preferred' },
    { key: 'host', op: '=', value: 'a' },
  ]

  it('leaves body chips in shared filters (no migration to the detail box)', () => {
    const claimed = claimOwnedLogsFilters(filters, baseOptions)
    expect(claimed).toContainEqual({ key: 'body', op: '=~', value: 'shared' })
    expect(claimed).toContainEqual({ key: 'host', op: '=', value: 'a' })
  })

  it('collapses severity aliases onto the resolved column', () => {
    const claimed = claimOwnedLogsFilters(filters, baseOptions)
    expect(claimed.filter((filter) => ownedLogsDetailFilterRole(filter.key, baseOptions) === 'severity')).toEqual([
      { key: 'severity_text', op: '=', value: 'ERROR' },
    ])
  })

  it('collapses service aliases onto the resolved entity key', () => {
    const claimed = claimOwnedLogsFilters(filters, baseOptions)
    expect(claimed.filter((filter) => ownedLogsDetailFilterRole(filter.key, baseOptions) === 'service')).toEqual([
      { key: 'resource_attributes.service.name', op: '=', value: 'preferred' },
    ])
  })

  it('drops severity aliases LevelFilter cannot represent', () => {
    const claimed = claimOwnedLogsFilters(
      [
        { key: 'severity', op: '!=', value: 'DEBUG' },
        { key: 'host', op: '=', value: 'a' },
      ],
      baseOptions
    )
    expect(claimed).toEqual([{ key: 'host', op: '=', value: 'a' }])
  })
})

describe('findOwnedLogsDetailFilter', () => {
  it('prefers the resolved physical severity column over the semantic alias', () => {
    const filters: DrilldownFilter[] = [
      { key: 'severity', op: '=', value: 'WARN' },
      { key: 'severity_text', op: '=', value: 'ERROR' },
    ]
    expect(findOwnedLogsDetailFilter(filters, 'severity', baseOptions)).toEqual({
      key: 'severity_text',
      op: '=',
      value: 'ERROR',
    })
  })
})

describe('removeOwnedLogsFilterVariants', () => {
  it('removes every spelling of one owned role', () => {
    const next = removeOwnedLogsFilterVariants(
      [
        { key: 'severity', op: '=', value: 'WARN' },
        { key: 'severity_text', op: '=', value: 'ERROR' },
        { key: 'host', op: '=', value: 'a' },
      ],
      'severity',
      baseOptions
    )
    expect(next).toEqual([{ key: 'host', op: '=', value: 'a' }])
  })
})

describe('drilldownOpToLogsBodyOp', () => {
  it('maps shared body chip operators onto the local body ops', () => {
    expect(drilldownOpToLogsBodyOp('=~')).toBe('LIKE')
    expect(drilldownOpToLogsBodyOp('!~')).toBe('NOT LIKE')
    expect(drilldownOpToLogsBodyOp('=')).toBe('=')
    expect(drilldownOpToLogsBodyOp('!=')).toBe('!=')
    expect(drilldownOpToLogsBodyOp('>')).toBeUndefined()
  })
})

describe('isDirectLogsDetail', () => {
  it('is true only for the logs detail page without a Trace→Logs overlay id', () => {
    expect(
      isDirectLogsDetail({
        connection: { signal: ref('logs') },
        ui: { logsView: ref('detail'), logsTraceId: ref(undefined) },
      })
    ).toBe(true)
    expect(
      isDirectLogsDetail({
        connection: { signal: ref('logs') },
        ui: { logsView: ref('detail'), logsTraceId: ref('abc') },
      })
    ).toBe(false)
    expect(
      isDirectLogsDetail({
        connection: { signal: ref('logs') },
        ui: { logsView: ref('overview') },
      })
    ).toBe(false)
  })
})
