import { describe, expect, it } from 'vitest'
import {
  MAX_LAYOUT_TABLES,
  applyVisibleOrder,
  capLayoutMap,
  drainLegacyHidden,
  sanitizeLayoutMap,
  layoutEntriesEqual,
  resolveLayoutColumns,
  resolveLayoutOrder,
  toColumnLayoutEntry,
  type ColumnLayoutEntry,
  type ColumnLayoutMap,
} from './table-column-layout'

describe('resolveLayoutOrder', () => {
  it('falls back to schema order without an order', () => {
    expect(resolveLayoutOrder(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
    expect(resolveLayoutOrder(['a', 'b', 'c'], { hidden: ['b'] })).toEqual(['a', 'b', 'c'])
  })

  it('applies the stored order to every name, hidden included', () => {
    expect(resolveLayoutOrder(['a', 'b', 'c'], { hidden: ['b'], order: ['c', 'b', 'a'] })).toEqual(['c', 'b', 'a'])
  })

  it('appends columns added after the layout was saved', () => {
    expect(resolveLayoutOrder(['a', 'b', 'c'], { order: ['c', 'b'] })).toEqual(['c', 'b', 'a'])
  })
})

describe('resolveLayoutColumns', () => {
  it('shows every column in schema order without an entry', () => {
    expect(resolveLayoutColumns(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
    expect(resolveLayoutColumns(['a', 'b'], null)).toEqual(['a', 'b'])
    expect(resolveLayoutColumns(['a', 'b'], {})).toEqual(['a', 'b'])
  })

  it('hides the listed names and keeps the rest in display order', () => {
    expect(resolveLayoutColumns(['a', 'b', 'c'], { hidden: ['b'] })).toEqual(['a', 'c'])
    expect(resolveLayoutColumns(['a', 'b', 'c'], { hidden: ['b'], order: ['c', 'b', 'a'] })).toEqual(['c', 'a'])
  })

  it('appends columns added after the layout was saved, visible', () => {
    expect(resolveLayoutColumns(['a', 'b', 'c'], { order: ['b', 'a'] })).toEqual(['b', 'a', 'c'])
    expect(resolveLayoutColumns(['a', 'b', 'c'], { hidden: ['a'], order: ['b'] })).toEqual(['b', 'c'])
  })

  it('can hide every column', () => {
    expect(resolveLayoutColumns(['a', 'b'], { hidden: ['a', 'b'] })).toEqual([])
  })
})

describe('toColumnLayoutEntry', () => {
  it('returns undefined for the default layout so callers drop the entry', () => {
    expect(toColumnLayoutEntry(['a', 'b'], ['a', 'b'], ['a', 'b'])).toBeUndefined()
    expect(toColumnLayoutEntry(['a', 'b'], ['a', 'b', 'ghost'], ['a', 'b'])).toBeUndefined()
  })

  it('stores a hide-only delta', () => {
    expect(toColumnLayoutEntry(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'c'])).toEqual({ hidden: ['b'] })
  })

  it('stores the order only when it differs from the schema order', () => {
    expect(toColumnLayoutEntry(['a', 'b', 'c'], ['b', 'a', 'c'], ['a', 'b', 'c'])).toEqual({
      order: ['b', 'a', 'c'],
    })
    expect(toColumnLayoutEntry(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b'])).toEqual({ hidden: ['c'] })
  })

  it('stores hidden + order together, keeping hidden columns in the order', () => {
    expect(toColumnLayoutEntry(['a', 'b', 'c'], ['c', 'b', 'a'], ['c', 'a'])).toEqual({
      hidden: ['b'],
      order: ['c', 'b', 'a'],
    })
  })

  it('drops duplicate and out-of-schema names', () => {
    expect(toColumnLayoutEntry(['a', 'b'], ['b', 'b', 'ghost', 'a'], ['a', 'b'])).toEqual({ order: ['b', 'a'] })
  })

  it('re-adds names the caller forgot so they are not dropped from the layout', () => {
    expect(toColumnLayoutEntry(['a', 'b'], ['a'], ['a'])).toEqual({ hidden: ['b'] })
    expect(toColumnLayoutEntry(['a', 'b'], ['b'], ['b'])).toEqual({ hidden: ['a'], order: ['b', 'a'] })
  })

  it('represents an empty visible set as a full deny list', () => {
    expect(toColumnLayoutEntry(['a', 'b'], ['a', 'b'], [])).toEqual({ hidden: ['a', 'b'] })
    expect(toColumnLayoutEntry(['a', 'b'], [], [])).toEqual({ hidden: ['a', 'b'] })
  })
})

describe('applyVisibleOrder', () => {
  it('reorders visible slots and keeps hidden columns in place', () => {
    expect(applyVisibleOrder(['ts', 'a', 'b', 'c'], ['c', 'a'])).toEqual(['ts', 'c', 'b', 'a'])
    expect(applyVisibleOrder(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a'])
    expect(applyVisibleOrder(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('appends names that were not part of the previous order', () => {
    expect(applyVisibleOrder(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(applyVisibleOrder([], ['a'])).toEqual(['a'])
  })

  it('is a no-op for an empty visible order', () => {
    expect(applyVisibleOrder(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('malformed entries', () => {
  it('never throws and ignores the malformed fields', () => {
    const dirty = { order: 'a', hidden: 'b' } as unknown as ColumnLayoutEntry
    expect(() => resolveLayoutColumns(['a', 'b'], dirty)).not.toThrow()
    expect(resolveLayoutColumns(['a', 'b'], dirty)).toEqual(['a', 'b'])
    expect(resolveLayoutOrder(['a', 'b'], dirty)).toEqual(['a', 'b'])
    expect(layoutEntriesEqual(dirty, { hidden: ['b'] })).toBe(false)
  })
})

describe('per-table isolation', () => {
  it('a layout saved for one table cannot hide another table', () => {
    const entry = toColumnLayoutEntry(['a1', 'a2'], ['a2', 'a1'], ['a2', 'a1'])
    const map: ColumnLayoutMap = entry ? { logs_a: entry } : {}
    expect(resolveLayoutColumns(['b1', 'b2', 'b3'], map.logs_b)).toEqual(['b1', 'b2', 'b3'])
    expect(resolveLayoutColumns(['a1', 'a2'], map.logs_a)).toEqual(['a2', 'a1'])
  })
})

describe('drainLegacyHidden', () => {
  it('drops the current table names and keeps the rest', () => {
    expect(drainLegacyHidden(['a', 'x'], ['a', 'b'])).toEqual(['x'])
    expect(drainLegacyHidden(['x'], ['a'])).toEqual(['x'])
    expect(drainLegacyHidden(undefined, ['a'])).toEqual([])
    expect(drainLegacyHidden([], ['a'])).toEqual([])
  })
})

describe('capLayoutMap', () => {
  it('keeps the most recently written entries', () => {
    const map: ColumnLayoutMap = {}
    for (let index = 0; index < MAX_LAYOUT_TABLES + 5; index += 1) {
      map[`t${index}`] = { hidden: ['x'] }
    }
    const capped = capLayoutMap(map)
    expect(Object.keys(capped)).toHaveLength(MAX_LAYOUT_TABLES)
    expect(Object.keys(capped)[0]).toBe('t5')
    expect(capped[`t${MAX_LAYOUT_TABLES + 4}`]).toBeDefined()
  })

  it('leaves small maps untouched', () => {
    const map: ColumnLayoutMap = { t: { hidden: ['x'] } }
    expect(capLayoutMap(map)).toBe(map)
  })
})

describe('layoutEntriesEqual', () => {
  it('compares hidden and order', () => {
    expect(layoutEntriesEqual(undefined, undefined)).toBe(true)
    expect(layoutEntriesEqual({}, undefined)).toBe(true)
    expect(layoutEntriesEqual({ hidden: ['a'] }, { hidden: ['a'] })).toBe(true)
    expect(layoutEntriesEqual({ hidden: ['a'] }, { hidden: ['b'] })).toBe(false)
    expect(layoutEntriesEqual({ hidden: ['a'] }, { hidden: ['a'], order: ['b'] })).toBe(false)
  })
})

describe('sanitizeLayoutMap', () => {
  it('keeps valid per-table entries', () => {
    expect(sanitizeLayoutMap({ logs_a: { hidden: ['a'], order: ['b', 'a'] } })).toEqual({
      logs_a: { hidden: ['a'], order: ['b', 'a'] },
    })
  })

  it('discards legacy and corrupt values without throwing', () => {
    expect(sanitizeLayoutMap(['a', 'b'])).toEqual({})
    expect(sanitizeLayoutMap(null)).toEqual({})
    expect(sanitizeLayoutMap('a')).toEqual({})
    expect(sanitizeLayoutMap({ logs_a: ['a', 'b'] })).toEqual({})
    expect(sanitizeLayoutMap({ logs_a: null })).toEqual({})
    expect(sanitizeLayoutMap({ logs_a: { hidden: 'a', order: 'b' } })).toEqual({})
    expect(sanitizeLayoutMap({ logs_a: { hidden: [1, '', 'a'] } })).toEqual({ logs_a: { hidden: ['a'] } })
  })

  it('keeps the valid tables when one table is corrupt', () => {
    expect(sanitizeLayoutMap({ good: { hidden: ['a'] }, bad: ['a'] })).toEqual({ good: { hidden: ['a'] } })
  })
})
