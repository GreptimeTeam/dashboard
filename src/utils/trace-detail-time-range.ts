import { normalizeLogTimeBoundToMs } from './log-time-cursor'

/** Padding on each side of a trace anchor when loading all spans by id. */
export const TRACE_DETAIL_PAD_HOURS = 12

/**
 * Absolute unix-seconds window around a span/trace timestamp for partition pruning.
 * Accepts sec / ms / us / ns / ISO via {@link normalizeLogTimeBoundToMs}.
 */
export function buildTraceDetailUnixRange(
  anchor: unknown,
  padHours: number = TRACE_DETAIL_PAD_HOURS
): [number, number] | null {
  const ms = normalizeLogTimeBoundToMs(anchor)
  if (!Number.isFinite(ms)) {
    return null
  }
  const centerSec = Math.floor(ms / 1000)
  const padSec = Math.max(0, padHours) * 3600
  return [centerSec - padSec, centerSec + padSec]
}
