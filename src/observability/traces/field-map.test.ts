import { describe, expect, it } from 'vitest'
import {
  buildDefaultTracesFieldMap,
  discoverTraceBreakdownAttributes,
  discoverTraceFilterKeys,
  discoverTraceLabelColumns,
  filterBreakdownAttributesByScope,
  mergeTracesFieldMapColumns,
  tableHasRequiredTraceColumns,
} from './field-map'
import { traceModelScore } from '../semantics/otlp'

describe('traces field-map', () => {
  it('builds identity map for filter chips', () => {
    const map = buildDefaultTracesFieldMap()
    expect(map.service_name).toBe('service_name')
    expect(map.traceId).toBe('trace_id')
    expect(map.time).toBe('timestamp')
  })

  it('discovers only TRACE_LABEL_KEYS present on the table', () => {
    expect(
      discoverTraceLabelColumns([
        { name: 'service_name' },
        { name: 'span_name' },
        { name: 'duration_nano' },
        { name: 'span_attributes.http.method' },
      ])
    ).toEqual(['service_name', 'span_name'])
  })

  it('exposes every business field as a top-bar filter key', () => {
    const keys = discoverTraceFilterKeys([
      { name: 'service_name', data_type: 'String' },
      { name: 'span_name', data_type: 'String' },
      { name: 'span_kind', data_type: 'String' },
      { name: 'duration_nano', data_type: 'UInt64' },
      { name: 'resource_attributes.deployment.environment', data_type: 'String' },
      { name: 'span_attributes.http.status_code', data_type: 'UInt64' },
      { name: 'trace_id', data_type: 'String' },
      { name: 'span_id', data_type: 'String' },
      { name: 'span_events', data_type: 'Json' },
    ])

    expect(keys).toContain('span_attributes.http.status_code')
    expect(keys).toContain('resource_attributes.deployment.environment')
    expect(keys).toContain('duration_nano')
    expect(keys).toContain('span_name')
    // Identity / payload columns have their own entry points.
    expect(keys).not.toContain('trace_id')
    expect(keys).not.toContain('span_id')
    expect(keys).not.toContain('span_events')
  })

  it('discovers Resource and Span breakdown attributes like Grafana', () => {
    const attrs = discoverTraceBreakdownAttributes([
      { name: 'service_name', data_type: 'String' },
      { name: 'span_name', data_type: 'String' },
      { name: 'duration_nano', data_type: 'UInt64' },
      { name: 'trace_id', data_type: 'String' },
      { name: 'resource_attributes.telemetry.sdk.language', data_type: 'String' },
      { name: 'span_attributes.http.method', data_type: 'String' },
      { name: 'span_events', data_type: 'Json' },
    ])
    expect(attrs.find((a) => a.column === 'service_name')?.label).toBe('resource.service.name')
    expect(attrs.find((a) => a.column === 'service_name')?.scope).toBe('resource')
    expect(attrs.find((a) => a.column === 'resource_attributes.telemetry.sdk.language')?.label).toBe(
      'resource.telemetry.sdk.language'
    )
    expect(attrs.find((a) => a.column === 'span_attributes.http.method')?.label).toBe('span.http.method')
    expect(attrs.find((a) => a.column === 'span_attributes.http.method')?.scope).toBe('span')
    expect(attrs.some((a) => a.column === 'duration_nano')).toBe(false)
    expect(attrs.some((a) => a.column === 'trace_id')).toBe(false)
    expect(attrs.some((a) => a.column === 'span_events')).toBe(false)

    expect(filterBreakdownAttributesByScope(attrs, 'resource').every((a) => a.scope === 'resource')).toBe(true)
    expect(filterBreakdownAttributesByScope(attrs, 'span').every((a) => a.scope === 'span')).toBe(true)
  })

  it('merges breakdown columns into fieldMap for filters', () => {
    const merged = mergeTracesFieldMapColumns(buildDefaultTracesFieldMap(), ['resource_attributes.telemetry.sdk.name'])
    expect(merged['resource_attributes.telemetry.sdk.name']).toBe('resource_attributes.telemetry.sdk.name')
  })

  it('scores greptime_trace_v1 tables higher', () => {
    const cols = [
      'trace_id',
      'parent_span_id',
      'timestamp',
      'span_name',
      'service_name',
      'duration_nano',
      'span_id',
      'span_status_code',
      'span_kind',
    ]
    expect(tableHasRequiredTraceColumns(cols)).toBe(true)
    const v1 = traceModelScore(cols, { pipeline: 'greptime_trace_v1', tableName: 'opentelemetry_traces' })
    const plain = traceModelScore(cols, { tableName: 'other_traces' })
    expect(v1).toBeGreaterThan(plain)
  })
})
