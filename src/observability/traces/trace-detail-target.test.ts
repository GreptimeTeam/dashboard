import { describe, expect, it } from 'vitest'

import {
  traceDrawerFromQuery,
  traceDrawerToQuery,
  traceLogsDrawerFromQuery,
  traceLogsDrawerToQuery,
} from './trace-detail-target'

describe('trace drawer query', () => {
  const target = { table: 'opentelemetry_traces_v2', database: 'public', start: 100, end: 200 }

  it('round-trips an open drawer through the query string', () => {
    const query = traceDrawerToQuery({}, 'abc', target)

    expect(query).toEqual({
      traceId: 'abc',
      traceTable: 'opentelemetry_traces_v2',
      traceDb: 'public',
      traceStart: '100',
      traceEnd: '200',
    })
    expect(traceDrawerFromQuery(query)).toEqual({ traceId: 'abc', target })
  })

  it('keeps the list params and drops the drawer params when closing', () => {
    const open = traceDrawerToQuery({ builderForm: 'x', timeLength: '3600' }, 'abc', target)
    const closed = traceDrawerToQuery(open, '')

    expect(closed).toEqual({ builderForm: 'x', timeLength: '3600' })
  })

  it('replaces a previously open trace instead of mixing params', () => {
    const first = traceDrawerToQuery({}, 'a', target)
    const second = traceDrawerToQuery(first, 'b', { table: 'spans' })

    expect(second).toEqual({ traceId: 'b', traceTable: 'spans' })
  })

  it('is closed unless both the trace id and the table are present', () => {
    expect(traceDrawerFromQuery({})).toBeUndefined()
    expect(traceDrawerFromQuery({ traceId: 'abc' })).toBeUndefined()
    expect(traceDrawerFromQuery({ traceTable: 'spans' })).toBeUndefined()
  })

  it('ignores a malformed time window and reads array values', () => {
    expect(traceDrawerFromQuery({ traceId: ['abc'], traceTable: 'spans', traceStart: 'x', traceEnd: '9' })).toEqual({
      traceId: 'abc',
      target: { table: 'spans' },
    })
    expect(traceDrawerFromQuery({ traceId: 'abc', traceTable: 'spans', traceStart: '9', traceEnd: '1' })).toEqual({
      traceId: 'abc',
      target: { table: 'spans' },
    })
  })
})

describe('trace logs drawer query', () => {
  const target = { table: 'opentelemetry_logs', database: 'public', start: 100, end: 200 }

  it('round-trips through its own prefixed keys', () => {
    const query = traceLogsDrawerToQuery({}, 'abc', target)

    expect(query).toEqual({
      logsTraceId: 'abc',
      logsTable: 'opentelemetry_logs',
      logsDb: 'public',
      logsStart: '100',
      logsEnd: '200',
    })
    expect(traceLogsDrawerFromQuery(query)).toEqual({ traceId: 'abc', target })
  })

  it('is independent of the trace drawer params that are open at the same time', () => {
    const traceTarget = { table: 'spans' }
    const both = traceLogsDrawerToQuery(traceDrawerToQuery({ keep: '1' }, 't1', traceTarget), 'l1', target)

    expect(traceDrawerFromQuery(both)).toEqual({ traceId: 't1', target: traceTarget })
    expect(traceLogsDrawerFromQuery(both)).toEqual({ traceId: 'l1', target })

    const logsClosed = traceLogsDrawerToQuery(both, '')
    expect(logsClosed).toEqual({ keep: '1', traceId: 't1', traceTable: 'spans' })
    expect(traceLogsDrawerFromQuery(logsClosed)).toBeUndefined()
  })
})
