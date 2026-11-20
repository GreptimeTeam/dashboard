import type { ColumnWidthRule } from '../types'

/** Per-column soft cap used by the char-width estimator. */
export const COLUMN_MAX_WIDTH = 600

/**
 * Drag floor passed to VXE `resizable-config.minWidth`. Absorbers keep content
 * estimates as column `minWidth` so `fit` can distribute leftover and stay at
 * 100% container width; this lower floor overrides the drag clamp so columns
 * can still shrink below the estimate.
 */
export const COLUMN_RESIZE_MIN_WIDTH = 60

export type LeftoverStrategy = 'last-column' | 'proportional'

/**
 * Every column sizes to its content. Absorbers use `minWidth` so leftover
 * viewport space is distributed to them (VXE `fit` / pxMinList):
 * - `flexFields` (column.flex) → those fields only (e.g. slow-query `query`)
 * - else `proportional` → every field
 * - else `last-column` → last field only
 *
 * Frozen px widths replace `'auto'` so VXE stops re-measuring on every recalculate.
 * Do not pin absorbers as fixed `width` — that drops them out of leftover fill
 * and leaves the table narrower than the container after drag-to-narrow.
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
    rules[field] = isAbsorber ? { minWidth: width } : { width }
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

/**
 * Scale content estimates so their sum fits the host. Used by page tables
 * (e.g. Flow) that should stay at 100% container width without horizontal scroll.
 * Preserves relative proportions; clamps each field to `minWidth`.
 */
export function scaleWidthsToContainer(
  fields: string[],
  widths: Record<string, number>,
  containerWidth: number,
  minWidth = COLUMN_RESIZE_MIN_WIDTH
): Record<string, number> {
  if (!(containerWidth > 0) || fields.length === 0) {
    return widths
  }
  const sum = fields.reduce((total, field) => total + (widths[field] || 0), 0)
  if (!(sum > containerWidth)) {
    return widths
  }
  const scale = containerWidth / sum
  const scaled: Record<string, number> = {}
  fields.forEach((field) => {
    scaled[field] = Math.max(minWidth, Math.floor((widths[field] || 0) * scale))
  })
  const scaledSum = fields.reduce((total, field) => total + scaled[field], 0)
  const drift = containerWidth - scaledSum
  if (drift !== 0) {
    const last = fields[fields.length - 1]
    scaled[last] = Math.max(minWidth, scaled[last] + drift)
  }
  return scaled
}

export function areWidthRulesEqual(a: Record<string, ColumnWidthRule>, b: Record<string, ColumnWidthRule>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every((key) => a[key]?.width === b[key]?.width && a[key]?.minWidth === b[key]?.minWidth)
}
