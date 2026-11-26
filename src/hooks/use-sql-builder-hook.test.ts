import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import useSqlBuilderHook from './use-sql-builder-hook'
import type { BuilderFormState } from '@/types/query'

function generate(conditions: BuilderFormState['conditions'], table = 'opentelemetry_traces_v2') {
  const hook = useSqlBuilderHook({
    timeRangeValues: ref(['', '']),
    defaultFormState: { table, conditions, orderByField: '', orderBy: 'DESC', limit: 100 },
  })
  return hook.generateSql(hook.builderFormState)
}

describe('sql builder hook — JSON2 attributes', () => {
  it('renders an attribute chip as a JSON path instead of a column', () => {
    const sql = generate([
      {
        field: 'span_attributes.http.method',
        operator: '=',
        value: 'GET',
        fieldType: 'String',
        jsonAttribute: { column: 'span_attributes', path: 'http.method' },
      },
    ])
    expect(sql).toContain(`json_get_string("span_attributes", '$."http.method"')='GET'`)
    expect(sql).not.toContain('"span_attributes.http.method"')
  })

  it('casts the attribute for numeric comparisons', () => {
    const sql = generate([
      {
        field: 'span_attributes.response_size',
        operator: '>',
        value: '1000',
        fieldType: 'Number',
        jsonAttribute: { column: 'span_attributes', path: 'response_size' },
      },
    ])
    expect(sql).toContain(`json_get("span_attributes", '$."response_size"')::DOUBLE>1000`)
  })

  it('keeps boolean equality typed', () => {
    const sql = generate([
      {
        field: 'span_attributes.cached',
        operator: '=',
        value: 'true',
        fieldType: 'Boolean',
        jsonAttribute: { column: 'span_attributes', path: 'cached' },
      },
    ])
    expect(sql).toContain(`json_get("span_attributes", '$."cached"')::BOOLEAN=TRUE`)
  })

  it('renders IN lists and existence checks on the JSON path', () => {
    const sql = generate([
      {
        field: 'span_attributes.status',
        operator: 'IN',
        value: '200,404',
        fieldType: 'Number',
        jsonAttribute: { column: 'span_attributes', path: 'status' },
      },
      {
        field: 'span_attributes.user.id',
        operator: 'Exist',
        value: '',
        fieldType: 'String',
        jsonAttribute: { column: 'span_attributes', path: 'user.id' },
      },
    ])
    expect(sql).toContain(`json_get("span_attributes", '$."status"')::DOUBLE IN (200,404)`)
    expect(sql).toContain(`json_get_string("span_attributes", '$."user.id"') IS NOT NULL`)
  })

  it('leaves v1 flattened attribute columns untouched', () => {
    const sql = generate(
      [
        {
          field: 'span_attributes.response_size',
          operator: '>',
          value: '1000',
          fieldType: 'Number',
        },
      ],
      'opentelemetry_traces'
    )
    expect(sql).toContain('"span_attributes.response_size">1000')
    expect(sql).not.toContain('json_get')
  })
})
