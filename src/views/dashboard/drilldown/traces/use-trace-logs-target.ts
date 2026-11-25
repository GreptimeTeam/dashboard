import { computed, ref, watch, type ComputedRef } from 'vue'
import type { DrilldownContext } from '@/observability/context'
import resolveLogsRoles from '@/observability/logs/resolved-roles'
import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
import { buildTraceDetailUnixRange } from '@/utils/trace-detail-time-range'

export interface TraceLogsView {
  /** Where the trace's logs are read from; `undefined` while the logs table is still binding. */
  target: ComputedRef<TraceDetailTarget | undefined>
  /** Trace id column from the logs field map / settings roles (`''` falls back to name matching). */
  traceIdColumn: ComputedRef<string>
}

/**
 * Adapts Explore's "logs of this trace" state to the same `TraceLogsPanel` the Traces Query
 * page uses: the table comes from the (overlay) logs binding and the window from the trace
 * anchor, so both pages render the same view.
 *
 * The window is fixed when the drawer opens. Reading the live time range inside a computed
 * would refetch whenever a relative range ticks.
 */
export default function useTraceLogsTarget(ctx: DrilldownContext): TraceLogsView {
  const windowRange = ref<[number, number] | undefined>()

  watch(
    () => ctx.ui.logsTraceId.value,
    (traceId) => {
      if (!traceId) {
        windowRange.value = undefined
        return
      }
      // Gantt anchor first (±12h around the trace); a list click has none, so use the page range.
      const anchored = buildTraceDetailUnixRange(ctx.ui.focusTraceAt.value)
      const live = ctx.query.unixTimeRange()
      windowRange.value = anchored ?? (live.length === 2 ? [live[0], live[1]] : undefined)
    },
    { immediate: true }
  )

  const target = computed<TraceDetailTarget | undefined>(() => {
    if (!ctx.ui.logsTraceId.value) return undefined
    const { overlayLogs } = ctx.session
    // A queued open has not bound its table yet; the slot still holds the page binding.
    if (overlayLogs.pending) return undefined
    const table = ctx.semantics.logs.table.value
    if (!table) return undefined
    // Overlay bind still in flight: do not query the page table meanwhile.
    if (overlayLogs.active && overlayLogs.targetTable && overlayLogs.targetTable !== table) return undefined
    const database = ctx.semantics.logs.database.value || ctx.connection.logsDatabase.value
    return {
      table,
      ...(database ? { database } : {}),
      ...(windowRange.value ? { start: windowRange.value[0], end: windowRange.value[1] } : {}),
    }
  })

  const traceIdColumn = computed(() => {
    const roles = resolveLogsRoles(ctx)
    return roles.traceId || roles.trace_id || ''
  })

  return { target, traceIdColumn }
}
