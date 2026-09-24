import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { DrilldownContext } from './context'
import useDrilldownFilterOptions from './use-drilldown-filter-options'

vi.mock('./adapters/filter-options', () => ({
  canSuggestFilterValues: () => false,
  fetchFilterKeyOptions: vi.fn(async () => []),
  fetchFilterValueOptions: vi.fn(async () => ({ values: [] })),
  fetchLogsContainsKeyOptions: vi.fn(async () => []),
  fetchLogsFilterKeyOptions: vi.fn(async () => []),
  fetchSqlFieldKeys: vi.fn(async () => []),
  fetchSqlLabelKeys: vi.fn(async () => []),
}))

vi.mock('./drilldown-settings', () => ({
  loadDrilldownSettings: () => ({ logs: {} }),
  updateLogsDrilldownSettings: () => {},
}))

vi.mock('./logs/field-map', () => ({
  isLogsContainsFilterKey: () => false,
}))

const makeCtx = (signal: 'metrics' | 'logs' | 'traces', logsFieldMap: Record<string, string>) =>
  ({
    signal: ref(signal),
    metric: ref(undefined),
    logsTable: ref('otlp_logs'),
    tracesTable: ref(undefined),
    fieldMap: ref({ logs: logsFieldMap, traces: {} }),
    signalColumns: ref({ logs: ['severity', 'resource_attributes'] }),
    signalColumnTypes: ref({}),
    logsDatabase: ref('public'),
  }) as unknown as DrilldownContext

describe('useDrilldownFilterOptions isVisibleFilterKey', () => {
  it('hides the resolved service chip on logs — the service select owns its display', () => {
    const ctx = makeCtx('logs', { service: 'resource_attributes.service.name' })
    const { isVisibleFilterKey } = useDrilldownFilterOptions(ctx)
    expect(isVisibleFilterKey('resource_attributes.service.name')).toBe(false)
  })

  it('hides the physical service column on logs when the role is a column', () => {
    const ctx = makeCtx('logs', { service: 'service_name' })
    const { isVisibleFilterKey } = useDrilldownFilterOptions(ctx)
    expect(isVisibleFilterKey('service_name')).toBe(false)
  })

  it('keeps other JSON attribute chips and the canonical service alias visible on logs', () => {
    const ctx = makeCtx('logs', { service: 'resource_attributes.service.name' })
    const { isVisibleFilterKey } = useDrilldownFilterOptions(ctx)
    expect(isVisibleFilterKey('resource_attributes.deployment.environment')).toBe(true)
    expect(isVisibleFilterKey('service')).toBe(true)
  })

  it('keeps the service chip visible while no service role is resolved', () => {
    const ctx = makeCtx('logs', {})
    const { isVisibleFilterKey } = useDrilldownFilterOptions(ctx)
    expect(isVisibleFilterKey('resource_attributes.service.name')).toBe(true)
  })

  it('keeps the service chip visible on metrics', () => {
    const ctx = makeCtx('metrics', { service: 'resource_attributes.service.name' })
    const { isVisibleFilterKey } = useDrilldownFilterOptions(ctx)
    expect(isVisibleFilterKey('resource_attributes.service.name')).toBe(true)
  })
})
