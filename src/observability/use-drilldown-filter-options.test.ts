import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
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
  updateLogsDrilldownSettings: () => undefined,
}))

vi.mock('./logs/field-map', () => ({
  isLogsContainsFilterKey: () => false,
}))

const makeCtx = (signal: 'metrics' | 'logs' | 'traces', logsFieldMap: Record<string, string>) =>
  ({
    connection: {
      signal: ref(signal),
      logsDatabase: ref('public'),
    },
    query: {},
    semantics: {
      logs: {
        table: ref('otlp_logs'),
        fieldMap: ref(logsFieldMap),
        columns: ref(['severity', 'resource_attributes']),
        columnTypes: ref(undefined),
        entityFilterKeys: ref({}),
        revision: ref(1),
        ready: computed(() => true),
      },
      traces: {
        table: ref(undefined),
        fieldMap: ref({}),
        columns: ref(undefined),
        columnTypes: ref(undefined),
        entityFilterKeys: ref({}),
        revision: ref(0),
        ready: computed(() => false),
      },
    },
    ui: {
      metric: ref(undefined),
    },
    actions: {},
  } as unknown as DrilldownContext)

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
