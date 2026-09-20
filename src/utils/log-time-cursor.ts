/** A timestamp as returned by the data source (seconds, ms, us, ns, ISO string, …). */
export type LogTimeBound = number | string

/** Normalize row / cursor timestamps to epoch ms (sec, ms, us, ns, ISO). */
export function normalizeLogTimeBoundToMs(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return NaN
  }

  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return NaN
  }

  if (numeric < 1e11) {
    return numeric * 1000
  }
  if (numeric < 1e14) {
    return numeric
  }
  if (numeric < 1e17) {
    return numeric / 1000
  }
  return numeric / 1e6
}
