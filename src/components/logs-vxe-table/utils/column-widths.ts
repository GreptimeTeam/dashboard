import type { ColumnWidthRule, SeparateField } from '../types'

// ---------------------------------------------------------------------------
// Column width heuristics (parity with the legacy DataTable virtual mode)
//
// VXE cannot measure natural widths for our cell slots: the flex wrapper plus
// `col--ellipsis` always reports the current (fitted) width, so every column
// collapsed to the same width. Estimate px from sampled text instead and let
// the widest column absorb the leftover space.
// ---------------------------------------------------------------------------

/** Soft cap for separate (multi-column) mode — align with legacy DataTable. */
export const COLUMN_MAX_WIDTH = 600
export const COLUMN_MIN_WIDTH = 60
/** Timestamp column is fixed px so the time format never squashes. */
export const TIME_COLUMN_FIXED_WIDTH = 200
/** Rough table font advance + th/td horizontal padding (char heuristic, not DOM). */
export const ESTIMATED_CHAR_WIDTH_PX = 8
export const ESTIMATED_CELL_PADDING_PX = 32

export function estimateColumnWidthPx(charLen: number): number {
  const natural = Math.ceil(charLen * ESTIMATED_CHAR_WIDTH_PX + ESTIMATED_CELL_PADDING_PX)
  return Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, natural))
}

/**
 * Explicit widths per column: timestamp fixed, content columns sized by their
 * natural length, widest content column left flexible (minWidth only) so it
 * absorbs the leftover width exactly like the legacy virtual table.
 */
export function computeColumnWidthRules(
  fields: SeparateField[],
  naturalLengths: Record<string, number>
): Record<string, ColumnWidthRule> {
  let widestField = ''
  let widestLength = -1
  fields.forEach((item) => {
    if (item.isTs) {
      return
    }
    if ((naturalLengths[item.field] ?? 0) > widestLength) {
      widestLength = naturalLengths[item.field] ?? 0
      widestField = item.field
    }
  })

  const rules: Record<string, ColumnWidthRule> = {}
  fields.forEach((item) => {
    if (item.isTs) {
      rules[item.field] = { width: TIME_COLUMN_FIXED_WIDTH }
      return
    }
    const estimated = estimateColumnWidthPx(naturalLengths[item.field] || 0)
    rules[item.field] = item.field === widestField ? { minWidth: estimated } : { width: estimated }
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
