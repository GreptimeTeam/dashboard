import { describe, expect, it } from 'vitest'
import { parseCreateOptions, resolveMetricTableMeta } from './table-meta'

describe('parseCreateOptions', () => {
  it('parses single option', () => {
    expect(parseCreateOptions('on_physical_table=greptime_physical_table')).toEqual({
      on_physical_table: 'greptime_physical_table',
    })
  })

  it('parses options in arbitrary order and collapses extra whitespace', () => {
    expect(parseCreateOptions('  ttl=7d   on_physical_table=my_physical  ')).toEqual({
      ttl: '7d',
      on_physical_table: 'my_physical',
    })
  })

  it('keeps "=" inside values (e.g. long semantic option names)', () => {
    expect(
      parseCreateOptions(
        'greptime.semantic.metric.original_name=http.server.duration on_physical_table=greptime_physical_table'
      )
    ).toEqual({
      'greptime.semantic.metric.original_name': 'http.server.duration',
      'on_physical_table': 'greptime_physical_table',
    })
  })

  it('ignores malformed tokens and handles empty input', () => {
    expect(parseCreateOptions('')).toEqual({})
    expect(parseCreateOptions(null)).toEqual({})
    expect(parseCreateOptions(undefined)).toEqual({})
    expect(parseCreateOptions('novalue =x =y')).toEqual({})
  })
})

describe('resolveMetricTableMeta', () => {
  it('marks metric tables with on_physical_table as logical tables', () => {
    expect(resolveMetricTableMeta('metric', 'ttl=7d on_physical_table=greptime_physical_table')).toEqual({
      isLogicalTable: true,
      isPhysicalMetricTable: false,
      physicalTableName: 'greptime_physical_table',
    })
  })

  it('marks metric tables with physical_metric_table=true as physical tables', () => {
    expect(resolveMetricTableMeta('metric', 'physical_metric_table=true')).toEqual({
      isLogicalTable: false,
      isPhysicalMetricTable: true,
      physicalTableName: undefined,
    })
  })

  it('treats non-metric engines and missing options as normal tables', () => {
    expect(resolveMetricTableMeta('mito', 'merge_mode=last_non_null')).toEqual({
      isLogicalTable: false,
      isPhysicalMetricTable: false,
    })
    expect(resolveMetricTableMeta('METRIC', '')).toEqual({
      isLogicalTable: false,
      isPhysicalMetricTable: false,
      physicalTableName: undefined,
    })
    expect(resolveMetricTableMeta(undefined, undefined)).toEqual({
      isLogicalTable: false,
      isPhysicalMetricTable: false,
    })
  })
})
