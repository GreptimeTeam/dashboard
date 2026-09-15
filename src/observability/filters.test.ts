import { describe, expect, it } from 'vitest'
import {
  addFilter,
  buildPromMatchersString,
  filterIncludesValue,
  filtersToSqlWhere,
  hasLogsMappedFilters,
  resolveFieldMapColumn,
  toggleIncludeFilter,
} from './filters'

describe('filters fieldMap SQL mapping', () => {
  const fieldMap = {
    service: 'service_name',
    trace_id: 'trace_id',
    body: 'body',
    env: 'env',
  }

  it('resolveFieldMapColumn only returns mapped columns', () => {
    expect(resolveFieldMapColumn('service', fieldMap)).toBe('service_name')
    expect(resolveFieldMapColumn('instance', fieldMap)).toBeUndefined()
    expect(resolveFieldMapColumn('trace_id', fieldMap)).toBe('trace_id')
  })

  it('filtersToSqlWhere skips unmapped Prom-only labels', () => {
    const parts = filtersToSqlWhere(
      [
        { key: 'instance', op: '=', value: 'i-2' },
        { key: 'service', op: '=', value: 'checkout' },
        { key: 'env', op: '=~', value: 'prod.*' },
      ],
      fieldMap
    )
    expect(parts).toEqual([`"service_name" = 'checkout'`, `"env" ~ 'prod.*'`])
  })

  it('filtersToSqlWhere returns empty when nothing maps', () => {
    expect(filtersToSqlWhere([{ key: 'instance', op: '=', value: 'i-2' }], fieldMap)).toEqual([])
  })

  it('hasLogsMappedFilters requires table and mappable filters', () => {
    expect(hasLogsMappedFilters([{ key: 'service', op: '=', value: 'checkout' }], fieldMap)).toBe(false)
    expect(hasLogsMappedFilters([{ key: 'service', op: '=', value: 'checkout' }], fieldMap, 'otel_logs')).toBe(true)
    expect(hasLogsMappedFilters([{ key: 'instance', op: '=', value: 'i-2' }], fieldMap, 'otel_logs')).toBe(false)
  })

  it('filtersToSqlWhere ORs same-key multi-value as IN', () => {
    const filters = addFilter([{ key: 'service', op: '=', value: 'checkout' }], {
      key: 'service',
      op: '=',
      value: 'payments',
    })
    expect(filtersToSqlWhere(filters, fieldMap)).toEqual([`"service_name" IN ('checkout', 'payments')`])
  })

  it('filtersToSqlWhere emits json_get_string for JSON attribute chips', () => {
    const parts = filtersToSqlWhere([{ key: 'log_attributes.gen_ai.system', op: '=', value: 'openai' }], fieldMap)
    expect(parts).toEqual([`json_get_string("log_attributes", '$."gen_ai.system"') = 'openai'`])
  })

  it('filtersToSqlWhere uses knownJsonColumns for custom Json containers', () => {
    const parts = filtersToSqlWhere([{ key: 'payload.region', op: '=', value: 'us' }], fieldMap, {
      jsonColumns: ['payload'],
    })
    expect(parts).toEqual([`json_get_string("payload", '$."region"') = 'us'`])
  })
})

describe('same-key OR merge', () => {
  it('addFilter merges same-key includes into =~', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(filters).toEqual([{ key: 'service', op: '=~', value: 'a|b' }])
  })

  it('addFilter keeps different keys as AND list', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'env',
      op: '=',
      value: 'prod',
    })
    expect(filters).toEqual([
      { key: 'service', op: '=', value: 'a' },
      { key: 'env', op: '=', value: 'prod' },
    ])
  })

  it('toggleIncludeFilter removes an included value', () => {
    const merged = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(toggleIncludeFilter(merged, { key: 'service', op: '=', value: 'a' })).toEqual([
      { key: 'service', op: '=', value: 'b' },
    ])
  })

  it('filterIncludesValue reads merged =~ chip', () => {
    const filters = addFilter(addFilter([], { key: 'service', op: '=', value: 'a' }), {
      key: 'service',
      op: '=',
      value: 'b',
    })
    expect(filterIncludesValue(filters, 'service', 'a')).toBe(true)
    expect(filterIncludesValue(filters, 'service', 'c')).toBe(false)
  })

  it('buildPromMatchersString emits =~ for multi-value', () => {
    const filters = addFilter(addFilter([], { key: 'job', op: '=', value: 'api' }), {
      key: 'job',
      op: '=',
      value: 'worker',
    })
    expect(buildPromMatchersString(filters)).toBe('job=~"api|worker"')
  })
})
