import { describe, expect, it } from 'vitest'
import {
  ANYTIME_SQL_END,
  ANYTIME_SQL_START,
  buildKeysetIsoSqlRange,
  compareColumnTime,
  freezeUnixTimeRange,
  isCursorInsideFrozenWindow,
  unixRangeToIsoSqlLiterals,
} from './log-keyset-window'

describe('freezeUnixTimeRange', () => {
  it('freezes absolute rangeTime', () => {
    expect(freezeUnixTimeRange({ time: 30, rangeTime: ['1000', '2000'] })).toEqual([1000, 2000])
  })

  it('freezes relative time against nowSec once', () => {
    expect(freezeUnixTimeRange({ time: 30, rangeTime: [], nowSec: 2000 })).toEqual([200, 2000])
  })

  it('returns null for any-time', () => {
    expect(freezeUnixTimeRange({ time: 0, rangeTime: [] })).toBeNull()
  })
})

describe('unixRangeToIsoSqlLiterals', () => {
  it('quotes ISO timestamps', () => {
    const [start, end] = unixRangeToIsoSqlLiterals([1, 2])
    expect(start).toBe(`'${new Date(1000).toISOString()}'`)
    expect(end).toBe(`'${new Date(2000).toISOString()}'`)
  })
})

describe('compareColumnTime', () => {
  it('compares ns digit strings by length then lexicographic', () => {
    expect(compareColumnTime('99', '100')).toBeLessThan(0)
    expect(compareColumnTime('100', '100')).toBe(0)
    expect(compareColumnTime('101', '100')).toBeGreaterThan(0)
  })
})

describe('isCursorInsideFrozenWindow / buildKeysetIsoSqlRange', () => {
  const range = [1000, 2000] as const

  it('older direction requires cursor after window start', () => {
    expect(isCursorInsideFrozenWindow(1500, range, 'older')).toBe(true)
    expect(isCursorInsideFrozenWindow(1000, range, 'older')).toBe(false)
    expect(isCursorInsideFrozenWindow(999, range, 'older')).toBe(false)
  })

  it('builds older keyset [start, cursor)', () => {
    expect(buildKeysetIsoSqlRange(range, 1500, 'older', '1500')).toEqual([
      `'${new Date(1000_000).toISOString()}'`,
      '1500',
    ])
    expect(buildKeysetIsoSqlRange(range, 1000, 'older', '1000')).toBeNull()
  })

  it('anytime keysets against the cursor only', () => {
    expect(buildKeysetIsoSqlRange(null, 1500, 'older', '1500')).toEqual([ANYTIME_SQL_START, '1500'])
    expect(buildKeysetIsoSqlRange(null, 1500, 'newer', '1500')).toEqual(['1500', ANYTIME_SQL_END])
  })
})
