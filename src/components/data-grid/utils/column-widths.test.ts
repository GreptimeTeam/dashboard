import { describe, expect, it } from 'vitest'
import { areWidthRulesEqual, computeColumnWidthRules, resolveColumnWidthRule } from './column-widths'

describe('computeColumnWidthRules', () => {
  const fields = ['time', 'level', 'message']

  it('auto-sizes every column and lets the last one absorb leftover width', () => {
    expect(computeColumnWidthRules(fields)).toEqual({
      time: { width: 'auto' },
      level: { width: 'auto' },
      message: { minWidth: 'auto' },
    })
  })

  it('makes every column an absorber under proportional leftover strategy', () => {
    expect(computeColumnWidthRules(fields, null, 'proportional')).toEqual({
      time: { minWidth: 'auto' },
      level: { minWidth: 'auto' },
      message: { minWidth: 'auto' },
    })
  })

  it('uses frozen px widths when provided', () => {
    expect(computeColumnWidthRules(fields, { time: 180, level: 60, message: 400 })).toEqual({
      time: { width: 180 },
      level: { width: 60 },
      message: { minWidth: 400 },
    })
  })

  it('falls back to auto for fields missing from the frozen map', () => {
    expect(computeColumnWidthRules(fields, { time: 180 }).level).toEqual({ width: 'auto' })
  })

  it('lets flex fields absorb leftover instead of the last column', () => {
    expect(computeColumnWidthRules(fields, { time: 180, level: 60, message: 80 }, 'last-column', ['level'])).toEqual({
      time: { width: 180 },
      level: { minWidth: 60 },
      message: { width: 80 },
    })
  })
})

describe('resolveColumnWidthRule', () => {
  it('keeps the estimate when there is no explicit width', () => {
    expect(resolveColumnWidthRule({ minWidth: 220 }, null)).toEqual({ minWidth: 220 })
    expect(resolveColumnWidthRule(undefined, null)).toEqual({})
  })

  it('widens an undersized explicit width to the estimate (timestamp floor)', () => {
    expect(resolveColumnWidthRule({ minWidth: 220 }, 190)).toEqual({ minWidth: 220 })
    expect(resolveColumnWidthRule({ width: 220 }, 190)).toEqual({ width: 220 })
  })

  it('keeps an explicit width that is already larger than the estimate', () => {
    expect(resolveColumnWidthRule({ minWidth: 120 }, 150)).toEqual({ minWidth: 150 })
    expect(resolveColumnWidthRule(undefined, 280)).toEqual({ width: 280 })
  })
})

describe('areWidthRulesEqual', () => {
  it('compares width and minWidth by field', () => {
    expect(areWidthRulesEqual({ a: { width: 1 } }, { a: { width: 1 } })).toBe(true)
    expect(areWidthRulesEqual({ a: { width: 1 } }, { a: { width: 2 } })).toBe(false)
    expect(areWidthRulesEqual({ a: { minWidth: 'auto' } }, { a: { minWidth: 'auto' } })).toBe(true)
  })
})
