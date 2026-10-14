import { describe, expect, it } from 'vitest'
import { TRACE_DETAIL_PAD_HOURS, buildTraceDetailUnixRange } from './trace-detail-time-range'

describe('buildTraceDetailUnixRange', () => {
  it('pads ±12h around a unix-seconds anchor', () => {
    const center = 1_700_000_000
    expect(buildTraceDetailUnixRange(center)).toEqual([
      center - TRACE_DETAIL_PAD_HOURS * 3600,
      center + TRACE_DETAIL_PAD_HOURS * 3600,
    ])
  })

  it('normalizes nanosecond anchors', () => {
    const centerSec = 1_700_000_000
    const ns = centerSec * 1e9
    expect(buildTraceDetailUnixRange(ns)).toEqual([
      centerSec - TRACE_DETAIL_PAD_HOURS * 3600,
      centerSec + TRACE_DETAIL_PAD_HOURS * 3600,
    ])
  })

  it('returns null for invalid anchors', () => {
    expect(buildTraceDetailUnixRange(undefined)).toBeNull()
    expect(buildTraceDetailUnixRange('')).toBeNull()
    expect(buildTraceDetailUnixRange('not-a-time')).toBeNull()
  })
})
