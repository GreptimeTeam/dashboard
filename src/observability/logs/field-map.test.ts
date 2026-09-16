import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import {
  chipKeyForLogsTableFilter,
  classifyLogsFilterKey,
  discoverFieldColumns,
  discoverLabelColumns,
  discoverLogsFilterKeyColumns,
  isLogsBodyFilterKey,
  listJsonAttributeColumns,
  parseJsonFieldChipKey,
  sampleJsonAttributeFieldKeys,
  sqlJsonGetStringExpr,
  type SchemaColumn,
} from './field-map'

vi.mock('@/api/editor', () => ({
  default: {
    getTableSchema: vi.fn(),
    runSQL: vi.fn(),
  },
}))

describe('discoverLabelColumns', () => {
  it('includes string columns and excludes only resolved body/time roles', () => {
    const columns: SchemaColumn[] = [
      { name: 'timestamp', data_type: 'TimestampMillisecond', semantic_type: 'TIMESTAMP' },
      { name: 'message', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'pod', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'cluster', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'file', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'line_no', data_type: 'Int64', semantic_type: 'FIELD' },
    ]

    expect(
      discoverLabelColumns(columns, {
        time: 'timestamp',
        body: 'message',
      })
    ).toEqual(['cluster', 'file', 'level', 'pod', 'trace_id'])
  })

  it('keeps TAG columns and other strings; settings include cannot revive an excluded role', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'client', data_type: 'String', semantic_type: 'TAG' },
      { name: 'country', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
    ]

    expect(
      discoverLabelColumns(columns, { time: 'ts', body: 'body', primaryGroupBy: 'client' }, { include: ['country'] })
    ).toEqual(['client', 'country'])
  })

  it('excludes the configured body column, not a hardcoded body name', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'message', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'payload_text', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'ip', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'extra', data_type: 'Json', semantic_type: 'FIELD' },
    ]

    expect(discoverLabelColumns(columns, { time: 'ts', body: 'payload_text' })).toEqual(['ip', 'message'])
    expect(discoverLogsFilterKeyColumns(columns, { time: 'ts', body: 'payload_text' })).toEqual([
      'ip',
      'message',
      'payload_text',
    ])
    expect(isLogsBodyFilterKey('body', { body: 'payload_text' })).toBe(true)
    expect(isLogsBodyFilterKey('message', { body: 'payload_text', message: 'message' })).toBe(false)
    expect(isLogsBodyFilterKey('payload_text', { body: 'payload_text', payload_text: 'payload_text' })).toBe(true)
  })

  it('never includes JSON attribute containers', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'service_name', data_type: 'String', semantic_type: 'TAG' },
      { name: 'log_attributes', data_type: 'Json', semantic_type: 'FIELD' },
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
    ]

    expect(discoverLabelColumns(columns, { time: 'ts', body: 'body', service: 'service_name' })).toEqual([
      'service_name',
    ])
  })

  it('includes the severity role column as a label, but not as a filter key', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'pod', data_type: 'String', semantic_type: 'FIELD' },
    ]

    expect(discoverLabelColumns(columns, { time: 'ts', body: 'body', severity: 'level' })).toEqual(['level', 'pod'])
    expect(discoverLogsFilterKeyColumns(columns, { time: 'ts', body: 'body', severity: 'level' })).toEqual([
      'body',
      'pod',
    ])
  })
})

describe('discoverFieldColumns', () => {
  it('includes time/body/traceId roles and non-label scalars', () => {
    const columns: SchemaColumn[] = [
      { name: 'timestamp', data_type: 'TimestampMillisecond', semantic_type: 'TIMESTAMP' },
      { name: 'message', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'service_name', data_type: 'String', semantic_type: 'TAG' },
      { name: 'file', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'line_no', data_type: 'Int64', semantic_type: 'FIELD' },
      { name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'log_attributes', data_type: 'Json', semantic_type: 'FIELD' },
    ]

    expect(
      discoverFieldColumns(columns, {
        time: 'timestamp',
        body: 'message',
        severity: 'level',
        service: 'service_name',
        traceId: 'trace_id',
      })
    ).toEqual(['line_no', 'message', 'timestamp'])
  })

  it('does not overlap with discoverLabelColumns', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'service_name', data_type: 'String', semantic_type: 'TAG' },
      { name: 'pod', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'file', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'line_no', data_type: 'Int64', semantic_type: 'FIELD' },
    ]
    const fieldMap = {
      time: 'ts',
      body: 'body',
      service: 'service_name',
      primaryGroupBy: 'service_name',
      severity: 'level',
    }

    const labels = discoverLabelColumns(columns, fieldMap)
    const fields = discoverFieldColumns(columns, fieldMap)
    expect(labels).toEqual(['file', 'level', 'pod', 'service_name'])
    expect(fields).toEqual(['body', 'line_no', 'ts'])
    expect(labels.filter((key) => fields.includes(key))).toEqual([])
  })
})

describe('classifyLogsFilterKey', () => {
  const columns: SchemaColumn[] = [
    { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
    { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
    { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
    { name: 'service_name', data_type: 'String', semantic_type: 'TAG' },
    { name: 'pod', data_type: 'String', semantic_type: 'FIELD' },
    { name: 'file', data_type: 'String', semantic_type: 'FIELD' },
    { name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' },
    { name: 'log_attributes', data_type: 'Json', semantic_type: 'FIELD' },
  ]
  const fieldMap = {
    time: 'ts',
    body: 'body',
    severity: 'level',
    service: 'service_name',
    primaryGroupBy: 'service_name',
    traceId: 'trace_id',
  }

  it('maps settings roles to label / field / level', () => {
    expect(classifyLogsFilterKey('service_name', columns, fieldMap)).toBe('label')
    expect(classifyLogsFilterKey('service', columns, fieldMap)).toBe('label')
    expect(classifyLogsFilterKey('pod', columns, fieldMap)).toBe('label')
    expect(classifyLogsFilterKey('level', columns, fieldMap)).toBe('level')
    expect(classifyLogsFilterKey('severity', columns, fieldMap)).toBe('level')
    expect(classifyLogsFilterKey('ts', columns, fieldMap)).toBe('field')
    expect(classifyLogsFilterKey('body', columns, fieldMap)).toBe('field')
    expect(classifyLogsFilterKey('trace_id', columns, fieldMap)).toBe('label')
    expect(classifyLogsFilterKey('file', columns, fieldMap)).toBe('label')
  })

  it('maps JSON attribute chips to field', () => {
    expect(classifyLogsFilterKey('log_attributes.gen_ai.system', columns, fieldMap)).toBe('field')
  })

  it('maps severity table columns to physical column chip key', () => {
    expect(chipKeyForLogsTableFilter('level', columns, fieldMap)).toBe('level')
    expect(chipKeyForLogsTableFilter('pod', columns, fieldMap)).toBe('pod')
    expect(chipKeyForLogsTableFilter('body', columns, fieldMap)).toBe('body')
  })
})

describe('JSON attribute field keys', () => {
  beforeEach(() => {
    vi.mocked(editorApi.runSQL).mockReset()
  })

  it('lists JSON container columns by name and data_type', () => {
    const columns: SchemaColumn[] = [
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'log_attributes', data_type: 'Json', semantic_type: 'FIELD' },
      { name: 'payload', data_type: 'Json', semantic_type: 'FIELD' },
    ]
    expect(listJsonAttributeColumns(columns)).toEqual(['log_attributes', 'payload'])
  })

  it('parses chip keys with dotted OTel paths', () => {
    expect(parseJsonFieldChipKey('log_attributes.gen_ai.system')).toEqual({
      column: 'log_attributes',
      path: 'gen_ai.system',
    })
    expect(parseJsonFieldChipKey('payload.foo', ['payload'])).toEqual({
      column: 'payload',
      path: 'foo',
    })
    expect(parseJsonFieldChipKey('pod')).toBeUndefined()
  })

  it('builds json_get_string expressions', () => {
    expect(sqlJsonGetStringExpr('log_attributes', 'gen_ai.system')).toBe(
      `json_get_string("log_attributes", '$."gen_ai.system"')`
    )
  })

  it('samples top-level JSON keys into chip keys', async () => {
    vi.mocked(editorApi.runSQL).mockResolvedValue({
      output: [
        {
          records: {
            rows: [[{ 'gen_ai.system': 'openai', 'model': 'gpt' }], ['{"region":"us"}']],
          },
        },
      ],
    } as never)

    const keys = await sampleJsonAttributeFieldKeys('genai_conversations', ['log_attributes'])
    expect(keys).toEqual(['log_attributes.gen_ai.system', 'log_attributes.model', 'log_attributes.region'])
  })
})
