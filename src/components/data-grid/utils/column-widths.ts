import type { ColumnWidthRule } from '../types'

/** Per-column soft cap used by the char-width estimator. */
export const COLUMN_MAX_WIDTH = 600

/**
 * Floor for drag-to-narrow. Absorbers used to set `minWidth` to the content
 * estimate, which made VXE refuse to shrink below that estimate (widen-only).
 * Keep a low floor and pin the estimate as `width` instead.
 */
export const COLUMN_RESIZE_MIN_WIDTH = 60

export type LeftoverStrategy = 'last-column' | 'proportional'

/**
 * Every column sizes to its content. Absorbers use `minWidth` so leftover
 * viewport space is distributed to them:
 * - `flexFields` (column.flex) → those fields only (e.g. slow-query `query`)
 * - else `proportional` → every field
 * - else `last-column` → last field only
 *
 * Frozen px widths replace `'auto'` so VXE stops re-measuring on every recalculate.
 * Numeric absorber widths are `{ width, minWidth: floor }` so columns can shrink
 * on drag; `'auto'` absorbers keep `{ minWidth: 'auto' }` for leftover fill.
 */
export function computeColumnWidthRules(
  fields: string[],
  frozen: Record<string, number> | null = null,
  leftoverStrategy: LeftoverStrategy = 'last-column',
  flexFields: readonly string[] | null = null
): Record<string, ColumnWidthRule> {
  const flexSet = flexFields && flexFields.length > 0 ? new Set(flexFields) : null
  const absorber = fields[fields.length - 1]
  const rules: Record<string, ColumnWidthRule> = {}
  fields.forEach((field) => {
    const width = frozen?.[field] ?? 'auto'
    const isAbsorber = flexSet ? flexSet.has(field) : leftoverStrategy === 'proportional' || field === absorber
    if (!isAbsorber) {
      rules[field] = { width }
      return
    }
    if (typeof width === 'number') {
      rules[field] = { width, minWidth: Math.min(COLUMN_RESIZE_MIN_WIDTH, width) }
      return
    }
    rules[field] = { minWidth: width }
  })
  return rules
}

/**
 * Merge a page-declared `column.width` with the content estimate.
 *
 * Explicit widths used to win outright, which clipped timestamp columns that
 * still declared legacy Arco widths (e.g. 190px for `YYYY-MM-DD HH:mm:ss.SSS`).
 * Take the larger value and keep the estimated rule shape (`width` vs
 * `minWidth`) so leftoverStrategy still applies.
 */
export function resolveColumnWidthRule(
  estimated: ColumnWidthRule | undefined,
  explicitWidth: number | null | undefined
): ColumnWidthRule {
  if (explicitWidth == null || !(explicitWidth > 0)) {
    return estimated || {}
  }
  let estimatedPx = 0
  if (typeof estimated?.width === 'number') {
    estimatedPx = estimated.width
  } else if (typeof estimated?.minWidth === 'number') {
    estimatedPx = estimated.minWidth
  }
  const px = Math.max(explicitWidth, estimatedPx)
  if (estimated?.minWidth !== undefined) {
    return { minWidth: px }
  }
  if (estimated?.width !== undefined) {
    return { width: px }
  }
  return { width: px }
}

export function areWidthRulesEqual(a: Record<string, ColumnWidthRule>, b: Record<string, ColumnWidthRule>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every((key) => a[key]?.width === b[key]?.width && a[key]?.minWidth === b[key]?.minWidth)
}
