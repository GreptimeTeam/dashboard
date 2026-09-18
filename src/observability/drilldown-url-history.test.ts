import { describe, expect, it } from 'vitest'
import { drilldownDetailIdentity, drilldownQueriesEqual, shouldPushDrilldownHistory } from './drilldown-url-history'

describe('drilldownDetailIdentity', () => {
  it('returns metric identity', () => {
    expect(drilldownDetailIdentity({ metric: 'http_requests_total' })).toBe('metric:http_requests_total')
  })

  it('returns logs detail identity', () => {
    expect(drilldownDetailIdentity({ logsView: 'detail' })).toBe('logs:detail')
  })

  it('returns trace identity', () => {
    expect(drilldownDetailIdentity({ focusTraceId: 'abc' })).toBe('trace:abc')
  })

  it('keeps logs-trace identity ahead of gantt so Back does not skip the logs drawer', () => {
    expect(drilldownDetailIdentity({ logsTraceId: 'abc' })).toBe('logsTrace:abc')
    expect(drilldownDetailIdentity({ logsTraceId: 'abc', focusTraceId: 'abc' })).toBe('logsTrace:abc')
  })

  it('returns null for overview', () => {
    expect(drilldownDetailIdentity({ signal: 'metrics', timeLength: '30' })).toBeNull()
  })
})

describe('shouldPushDrilldownHistory', () => {
  it('pushes when entering detail from overview', () => {
    expect(shouldPushDrilldownHistory({ timeLength: '30' }, { timeLength: '30', metric: 'up' })).toBe(true)
    expect(shouldPushDrilldownHistory({ signal: 'logs' }, { signal: 'logs', logsView: 'detail' })).toBe(true)
    expect(shouldPushDrilldownHistory({ signal: 'traces' }, { signal: 'traces', focusTraceId: 't1' })).toBe(true)
    expect(shouldPushDrilldownHistory({ signal: 'logs' }, { signal: 'logs', focusTraceId: 't1' })).toBe(true)
    expect(shouldPushDrilldownHistory({ signal: 'traces' }, { signal: 'traces', logsTraceId: 't1' })).toBe(true)
  })

  it('pushes when switching detail identity or closing detail', () => {
    expect(shouldPushDrilldownHistory({ metric: 'a' }, { metric: 'b' })).toBe(true)
    expect(
      shouldPushDrilldownHistory({ signal: 'traces', focusTraceId: 't1' }, { signal: 'traces', focusTraceId: 't2' })
    ).toBe(true)
    expect(
      shouldPushDrilldownHistory(
        { signal: 'traces', logsTraceId: 't1' },
        { signal: 'traces', logsTraceId: 't1', focusTraceId: 't1' }
      )
    ).toBe(true)
    expect(shouldPushDrilldownHistory({ metric: 'up' }, { timeLength: '30' })).toBe(true)
  })

  it('pushes query-parameter-only changes', () => {
    expect(shouldPushDrilldownHistory({ metric: 'up' }, { metric: 'up', timeLength: '60' })).toBe(true)
    expect(shouldPushDrilldownHistory({ timeLength: '30' }, { timeLength: '60' })).toBe(true)
    expect(shouldPushDrilldownHistory({ signal: 'metrics' }, { signal: 'logs' })).toBe(true)
  })

  it('does not push when the query is unchanged', () => {
    expect(shouldPushDrilldownHistory({ metric: 'up', timeLength: '30' }, { metric: 'up', timeLength: '30' })).toBe(
      false
    )
    expect(shouldPushDrilldownHistory({ metric: 'up' }, { metric: 'up', tab: '' })).toBe(false)
  })
})

describe('drilldownQueriesEqual', () => {
  it('treats missing and empty as equal', () => {
    expect(drilldownQueriesEqual({ metric: 'up' }, { metric: 'up', tab: '' })).toBe(true)
  })

  it('detects differences', () => {
    expect(drilldownQueriesEqual({ metric: 'a' }, { metric: 'b' })).toBe(false)
  })
})
