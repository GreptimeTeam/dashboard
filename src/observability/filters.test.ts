import { describe, expect, it } from 'vitest'
import { filtersToSqlWhere, resolveFieldMapColumn } from './filters'

describe('filters fieldMap SQL mapping', () => {
  const fieldMap = {
    service: 'service_name',
    trace_id: 'trace_id',
    body: 'body',
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
    expect(parts).toEqual([`"service_name" = 'checkout'`])
  })

  it('filtersToSqlWhere returns empty when nothing maps', () => {
    expect(filtersToSqlWhere([{ key: 'instance', op: '=', value: 'i-2' }], fieldMap)).toEqual([])
  })
})
