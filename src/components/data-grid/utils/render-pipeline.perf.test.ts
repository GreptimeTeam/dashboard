import { describe, expect, it } from 'vitest'
import type { ColumnType } from '@/types/query'
import { buildDisplayRows } from './table-data'
import { buildVxeColumns } from './vxe-columns'
import { computeColumnWidthRules } from './column-widths'
import type { LogsColumnMode } from '../types'

/**
 * Guards for the JS side of DataGrid rendering.
 *
 * These are NOT the primary performance suite (that is `tests/perf/*.spec.ts`,
 * which measures real DOM rendering). What is locked here is the shape of the
 * per-cell pipeline, which regresses silently:
 *
 *   - column metadata lookups must be O(1) per cell, not a `columns.find()` scan
 *     inside the row × field loop;
 *   - the display pass must only emit the visible fields, so a 40-column table
 *     with 3 displayed columns does not format 40 values per row.
 */

const COLUMN_COUNT = 40
const TS = 'timestamp'

const columns: ColumnType[] = [
  { name: TS, data_type: 'TimestampNanosecond', title: TS },
  ...Array.from({ length: COLUMN_COUNT - 1 }, (_, i) => ({
    name: `field_${i}`,
    data_type: 'String',
    title: `field_${i}`,
  })),
]

const tsColumn = { name: TS, data_type: 'TimestampNanosecond' }

function makeRows(n: number) {
  return Array.from({ length: n }, (_, r) => {
    const row: Record<string, unknown> = {}
    columns.forEach((column, i) => {
      row[column.name] = i === 0 ? 1731000000000 + r * 1000 : `row-${r}-col-${i}`
    })
    return row
  })
}

function buildInput(data: Record<string, unknown>[], overrides: Partial<Parameters<typeof buildDisplayRows>[0]> = {}) {
  return {
    data,
    columns,
    displayedColumns: columns.map((c) => c.name),
    tsColumn,
    linkColumn: '',
    columnMode: 'separate' as LogsColumnMode,
    textOf: (value: unknown) => String(value),
    ...overrides,
  }
}

describe('buildDisplayRows', () => {
  it('emits the row index, the timestamp and every displayed field', () => {
    const rows = buildDisplayRows(buildInput(makeRows(2)))
    expect(rows).toHaveLength(2)
    expect(rows[0].__rowIndex).toBe(0)
    expect(rows[0][TS]).toBe('1731000000000')
    expect(rows[0].field_0).toBe('row-0-col-1')
    expect(rows[1].__rowIndex).toBe(1)
  })

  it('only touches displayed columns (hidden columns are not formatted)', () => {
    const formatted: string[] = []
    const rows = buildDisplayRows(
      buildInput(makeRows(1), {
        displayedColumns: [TS, 'field_0', 'field_1'],
        textOf: (value: unknown) => {
          formatted.push(String(value))
          return String(value)
        },
      })
    )
    expect(Object.keys(rows[0]).sort()).toEqual(['__rowIndex', TS, 'field_0', 'field_1'].sort())
    // One call for the timestamp column only — plain strings are not routed through textOf.
    expect(formatted).toHaveLength(1)
  })

  it('uses the original __rowIndex so pagination can map back to the source row', () => {
    const rows = buildDisplayRows(buildInput([{ ...makeRows(1)[0], __rowIndex: 42 }]))
    expect(rows[0].__rowIndex).toBe(42)
  })

  it('builds merged parts for merged column modes', () => {
    const merged = buildDisplayRows(buildInput(makeRows(1), { columnMode: 'merged-with-keys' }))
    expect(Array.isArray(merged[0].__merged_parts)).toBe(true)
    expect(merged[0].__merged_message).toContain('field_0: row-0-col-1')
  })

  it('stays within budget for a large result set (regression guard for O(n²) lookups)', () => {
    const data = makeRows(2000)
    const input = buildInput(data)
    // Warm up so JIT doesn't dominate the measurement.
    buildDisplayRows(input)
    const started = performance.now()
    buildDisplayRows(input)
    const elapsed = performance.now() - started

    // 2000 × 40 measures ~10ms on a laptop. A per-cell `columns.find()` scan
    // pushes this into the hundreds of ms, so 400ms still catches that regression
    // while leaving room for slow CI machines.
    expect(elapsed).toBeLessThan(400)
  })
})

describe('buildVxeColumns', () => {
  const rules = computeColumnWidthRules(columns.map((c) => c.name))

  function build(overrides: Partial<Parameters<typeof buildVxeColumns>[0]> = {}) {
    return buildVxeColumns({
      columnMode: 'separate',
      columns,
      displayedColumns: columns.map((c) => c.name),
      tsColumn,
      linkColumn: '',
      tsCellDetail: false,
      wrapLine: false,
      widthRules: rules,
      renderSeparateCell: () => null,
      renderMergedCell: () => null,
      renderHeader: () => null,
      ...overrides,
    })
  }

  it('creates one column per field and applies width rules', () => {
    const cols = build()
    expect(cols).toHaveLength(COLUMN_COUNT)
    expect(cols[0].width).toBe('auto')
  })

  it('is cheap enough to rebuild on every layout pass', () => {
    build()
    const started = performance.now()
    for (let i = 0; i < 50; i += 1) build()
    const elapsed = performance.now() - started
    // 50 builds × 40 columns. Locked so a future per-column scan does not creep in.
    expect(elapsed).toBeLessThan(300)
  })

  it('routes columns that have a parent slot through the slot renderer', () => {
    const slotRenderer = () => 'slot'
    const cols = build({
      hasColumnSlot: (field) => field === 'field_3',
      renderColumnSlot: slotRenderer,
    })
    const target = cols.find((c) => (c as { field?: string }).field === 'field_3') as {
      slots?: { default?: unknown }
    }
    expect(target.slots?.default).toBe(slotRenderer)
  })
})
