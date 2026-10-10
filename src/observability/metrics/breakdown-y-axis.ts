export interface BreakdownYAxisRange {
  min: number
  max: number
}

/**
 * Grafana metrics breakdown `syncYAxis` / `findNewMaxMin`.
 * Zeros are ignored (`filter(Boolean)`). A constant series does not establish a range.
 */
export function absorbBreakdownYAxis(
  current: BreakdownYAxisRange | null,
  values: Array<number | null | undefined>
): { range: BreakdownYAxisRange | null; changed: boolean } {
  const samples = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value !== 0
  )
  if (!samples.length) {
    return { range: current, changed: false }
  }

  const next = samples.reduce(
    (extent, value) => ({
      min: Math.min(extent.min, value),
      max: Math.max(extent.max, value),
    }),
    {
      min: current?.min ?? Number.POSITIVE_INFINITY,
      max: current?.max ?? Number.NEGATIVE_INFINITY,
    }
  )

  if (next.max === next.min || !Number.isFinite(next.min) || !Number.isFinite(next.max)) {
    return { range: current, changed: false }
  }

  const changed = current == null || next.min !== current.min || next.max !== current.max
  return { range: next, changed }
}
