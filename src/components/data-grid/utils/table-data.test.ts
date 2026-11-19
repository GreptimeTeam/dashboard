import { describe, expect, it } from 'vitest'
import type { ColumnType, TSColumn } from '@/types/query'
import { buildDisplayRows, getSeparateFields, getVisibleFieldNames, isTimeColumn } from './table-data'

const tsColumn: TSColumn = { name: 'time', title: 'time', data_type: 'TimestampNanosecond' }

const columns: ColumnType[] = [
  { name: 'level', title: 'level', data_type: 'String' },
  { name: 'message', title: 'message', data_type: 'String' },
  { name: 'json_payload', title: 'json_payload', data_type: 'Json' },
]

const fieldsInput = {
  columns,
  displayedColumns: [] as string[],
  tsColumn,
  linkColumn: '',
}

describe('isTimeColumn', () => {
  it('detects date-typed columns', () => {
    expect(isTimeColumn({ name: 't', data_type: 'TimestampMillisecond' })).toBe(true)
    expect(isTimeColumn({ name: 't', data_type: 'Date' })).toBe(true)
    expect(isTimeColumn({ name: 't', data_type: 'String' })).toBe(false)
    expect(isTimeColumn(null)).toBe(false)
  })
})

describe('getVisibleFieldNames', () => {
  it('defaults to all column names with timestamp excluded', () => {
    expect(getVisibleFieldNames(fieldsInput)).toEqual(['level', 'message', 'json_payload'])
  })

  it('honors displayedColumns and drops the timestamp', () => {
    expect(getVisibleFieldNames({ ...fieldsInput, displayedColumns: ['time', 'level'] })).toEqual(['level'])
  })
})

describe('getSeparateFields', () => {
  it('puts the timestamp first with fixed flags', () => {
    const fields = getSeparateFields(fieldsInput)
    expect(fields[0]).toEqual({ field: 'time', title: 'time', isTs: true, isTime: true, isLink: false })
    expect(fields.map((f) => f.field)).toEqual(['time', 'level', 'message', 'json_payload'])
  })

  it('marks the link column', () => {
    const traceColumn: ColumnType = { name: 'trace_id', title: 'trace_id', data_type: 'String' }
    const fields = getSeparateFields({
      ...fieldsInput,
      columns: [...columns, traceColumn],
      linkColumn: 'trace_id',
    })
    const trace = fields.find((f) => f.field === 'trace_id')
    expect(trace?.isLink).toBe(true)
  })
})

describe('buildDisplayRows', () => {
  const textOf = (value: unknown) => (value == null ? '' : String(value))

  it('formats the timestamp and stringifies content cells', () => {
    const rows = buildDisplayRows({
      ...fieldsInput,
      data: [{ time: 1, level: 'info', message: { a: 1 }, json_payload: null }],
      columnMode: 'separate',
      textOf,
    })
    expect(rows[0]).toEqual({
      __rowIndex: 0,
      time: '1',
      level: 'info',
      message: '{"a":1}',
      json_payload: '',
    })
  })

  it('builds merged parts and message (merged mode)', () => {
    const rows = buildDisplayRows({
      ...fieldsInput,
      data: [{ time: 1, level: 'info', message: 'hello', json_payload: null }],
      columnMode: 'merged',
      textOf,
    })
    expect(rows[0].__merged_parts).toEqual([
      { key: 'level', text: 'info', isLink: false },
      { key: 'message', text: 'hello', isLink: false },
    ])
    expect(rows[0].__merged_message).toBe('info hello')
  })

  it('prefixes keys in merged-with-keys mode', () => {
    const rows = buildDisplayRows({
      ...fieldsInput,
      data: [{ time: 1, level: 'info', message: 'hello', json_payload: null }],
      columnMode: 'merged-with-keys',
      textOf,
    })
    expect(rows[0].__merged_message).toBe('level: info message: hello')
  })

  it('marks the link part in merged mode and skips empty parts', () => {
    const rows = buildDisplayRows({
      ...fieldsInput,
      linkColumn: 'level',
      data: [{ time: 1, level: 'info', message: '', json_payload: null }],
      columnMode: 'merged',
      textOf,
    })
    expect(rows[0].__merged_parts).toEqual([{ key: 'level', text: 'info', isLink: true }])
  })

  it('preserves __rowIndex when provided', () => {
    const rows = buildDisplayRows({
      ...fieldsInput,
      data: [{ __rowIndex: 42, time: 1, level: 'info', message: '', json_payload: null }],
      columnMode: 'separate',
      textOf,
    })
    expect(rows[0].__rowIndex).toBe(42)
  })
})
