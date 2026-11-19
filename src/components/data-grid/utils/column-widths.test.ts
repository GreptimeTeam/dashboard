import { describe, expect, it } from 'vitest'
import { areWidthRulesEqual, computeColumnWidthRules } from './column-widths'

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

  it('makes every frozen column an absorber when expandAll is set', () => {
    expect(computeColumnWidthRules(fields, { time: 180, level: 60, message: 100 }, 'last-column', true)).toEqual({
      time: { minWidth: 180 },
      level: { minWidth: 60 },
      message: { minWidth: 100 },
    })
  })
})

describe('areWidthRulesEqual', () => {
  it('compares width and minWidth by field', () => {
    expect(areWidthRulesEqual({ a: { width: 1 } }, { a: { width: 1 } })).toBe(true)
    expect(areWidthRulesEqual({ a: { width: 1 } }, { a: { width: 2 } })).toBe(false)
    expect(areWidthRulesEqual({ a: { minWidth: 'auto' } }, { a: { minWidth: 'auto' } })).toBe(true)
  })
})
