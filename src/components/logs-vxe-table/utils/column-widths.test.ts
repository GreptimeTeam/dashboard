import { describe, expect, it } from 'vitest'
import {
  areWidthRulesEqual,
  computeColumnWidthRules,
  estimateColumnWidthPx,
  COLUMN_MAX_WIDTH,
  COLUMN_MIN_WIDTH,
  TIME_COLUMN_FIXED_WIDTH,
} from './column-widths'

describe('estimateColumnWidthPx', () => {
  it('adds padding to char length', () => {
    expect(estimateColumnWidthPx(10)).toBe(10 * 8 + 32)
  })

  it('clamps to min/max', () => {
    expect(estimateColumnWidthPx(0)).toBe(COLUMN_MIN_WIDTH)
    expect(estimateColumnWidthPx(100000)).toBe(COLUMN_MAX_WIDTH)
  })
})

describe('computeColumnWidthRules', () => {
  const fields = [
    { field: 'time', title: 'time', isTs: true, isTime: true, isLink: false },
    { field: 'level', title: 'level', isTs: false, isTime: false, isLink: false },
    { field: 'message', title: 'message', isTs: false, isTime: false, isLink: false },
  ]

  it('fixes the timestamp column width', () => {
    const rules = computeColumnWidthRules(fields, { time: 10, level: 5, message: 5 })
    expect(rules.time).toEqual({ width: TIME_COLUMN_FIXED_WIDTH })
  })

  it('gives the widest content column a flexible minWidth', () => {
    const rules = computeColumnWidthRules(fields, { time: 10, level: 5, message: 300 })
    expect(rules.message).toEqual({ minWidth: estimateColumnWidthPx(300) })
    expect(rules.level).toEqual({ width: estimateColumnWidthPx(5) })
  })

  it('falls back to minWidth for an empty table', () => {
    const rules = computeColumnWidthRules(fields, {})
    // Every content column has length 0; the first widest wins deterministically.
    expect(rules.level).toEqual({ minWidth: estimateColumnWidthPx(0) })
    expect(rules.message).toEqual({ width: estimateColumnWidthPx(0) })
  })
})

describe('areWidthRulesEqual', () => {
  it('compares by value, not identity', () => {
    expect(areWidthRulesEqual({ a: { width: 10 } }, { a: { width: 10 } })).toBe(true)
    expect(areWidthRulesEqual({ a: { width: 10 } }, { a: { minWidth: 10 } })).toBe(false)
    expect(areWidthRulesEqual({}, { a: { width: 10 } })).toBe(false)
  })
})
