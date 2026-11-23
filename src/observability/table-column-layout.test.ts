import { describe, expect, it } from 'vitest'
import {
  displayedColumnsFor,
  displayedColumnsFromLegacy,
  mergeDisplayedColumns,
  migrateLegacyColumnLayout,
  panelColumnOrder,
} from './table-column-layout'

describe('displayedColumnsFor', () => {
  it('returns all columns when never configured', () => {
    expect(displayedColumnsFor(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
    expect(displayedColumnsFor(['a', 'b'], null)).toEqual(['a', 'b'])
  })

  it('uses allowlist order and hides names absent from stored', () => {
    expect(displayedColumnsFor(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a'])
  })

  it('treats empty array as all hidden for the current table', () => {
    expect(displayedColumnsFor(['a', 'b'], [])).toEqual([])
  })
})

describe('mergeDisplayedColumns', () => {
  it('keeps other-table names and writes the new visible order first', () => {
    expect(mergeDisplayedColumns(['a', 'b', 'c'], ['c', 'a'], ['x', 'a', 'y'])).toEqual(['c', 'a', 'x', 'y'])
  })

  it('can persist an empty visible set', () => {
    expect(mergeDisplayedColumns(['a', 'b'], [], ['x'])).toEqual(['x'])
  })
})

describe('panelColumnOrder', () => {
  it('lists visible first then hidden in schema order', () => {
    expect(panelColumnOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('migrateLegacyColumnLayout', () => {
  it('returns undefined when there is no order', () => {
    expect(migrateLegacyColumnLayout(['a'], undefined)).toBeUndefined()
    expect(migrateLegacyColumnLayout(['a'], [])).toBeUndefined()
  })

  it('filters hidden names out of order', () => {
    expect(migrateLegacyColumnLayout(['b'], ['a', 'b', 'c'])).toEqual(['a', 'c'])
  })
})

describe('displayedColumnsFromLegacy', () => {
  it('applies denylist and optional order', () => {
    expect(displayedColumnsFromLegacy(['a', 'b', 'c'], ['b'], ['c', 'a'])).toEqual(['c', 'a'])
    expect(displayedColumnsFromLegacy(['a', 'b', 'c'], ['b'], undefined)).toEqual(['a', 'c'])
  })
})
