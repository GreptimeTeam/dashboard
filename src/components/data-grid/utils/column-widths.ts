import type { ColumnWidthRule } from '../types'

// ---------------------------------------------------------------------------
// Column widths are measured by VXE (`width: 'auto'` / `minWidth: 'auto'`).
// Measure-time CSS (`.vxe-table[data-calc-col]`) lets cells report their
// natural width; the cap below only applies when the table overflows.
// After the first measure we freeze to px so later recalculate / page changes
// do not re-read scrollWidth for every cell (very expensive with wide tables).
// ---------------------------------------------------------------------------

/** Per-column cap applied only when the natural table width overflows. */
export const COLUMN_MAX_WIDTH = 600

export type LeftoverStrategy = 'last-column' | 'proportional'

/**
 * Every column sizes to its content. Absorbers use `minWidth` so leftover
 * viewport space is distributed to them (`last-column` → last field only;
 * `proportional` → every field, VXE splits leftover evenly). Frozen px widths
 * replace `'auto'` so VXE stops re-measuring on every recalculate.
 *
 * `expandAll` (empty tables): every column is an absorber so spare viewport
 * width stretches headers instead of leaving a gap after the last column.
 */
export function computeColumnWidthRules(
  fields: string[],
  frozen: Record<string, number> | null = null,
  leftoverStrategy: LeftoverStrategy = 'last-column',
  expandAll = false
): Record<string, ColumnWidthRule> {
  const absorber = fields[fields.length - 1]
  const rules: Record<string, ColumnWidthRule> = {}
  fields.forEach((field) => {
    const width = frozen?.[field] ?? 'auto'
    const isAbsorber = expandAll || leftoverStrategy === 'proportional' || field === absorber
    rules[field] = isAbsorber ? { minWidth: width } : { width }
  })
  return rules
}

export function areWidthRulesEqual(a: Record<string, ColumnWidthRule>, b: Record<string, ColumnWidthRule>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every((key) => a[key]?.width === b[key]?.width && a[key]?.minWidth === b[key]?.minWidth)
}
