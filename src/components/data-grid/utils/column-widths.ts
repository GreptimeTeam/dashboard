import type { ColumnWidthRule } from '../types'

/** Per-column soft cap used by the char-width estimator. */
export const COLUMN_MAX_WIDTH = 600

export type LeftoverStrategy = 'last-column' | 'proportional'

/**
 * Every column sizes to its content. Absorbers use `minWidth` so leftover
 * viewport space is distributed to them (`last-column` → last field only;
 * `proportional` → every field, VXE splits leftover evenly). Frozen px widths
 * replace `'auto'` so VXE stops re-measuring on every recalculate.
 */
export function computeColumnWidthRules(
  fields: string[],
  frozen: Record<string, number> | null = null,
  leftoverStrategy: LeftoverStrategy = 'last-column'
): Record<string, ColumnWidthRule> {
  const absorber = fields[fields.length - 1]
  const rules: Record<string, ColumnWidthRule> = {}
  fields.forEach((field) => {
    const width = frozen?.[field] ?? 'auto'
    const isAbsorber = leftoverStrategy === 'proportional' || field === absorber
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
