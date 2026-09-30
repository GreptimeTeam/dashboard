import { ref, toValue, watch, type WatchSource } from 'vue'
import type { DrilldownContext } from './context'

export type SignalQuerySignal = 'logs' | 'traces'

export interface UseSignalQueryOptions {
  /** When false, skip runs (visibility / keep-alive / lazy panel). Default true. */
  enabled?: WatchSource<boolean> | (() => boolean)
  /** Extra component inputs (redMetric, groupBy, …). Serialized into the signature. */
  params?: () => unknown
  /** Perform the fetch. Caller handles its own loading/error UI. */
  run: () => void | Promise<void>
}

/**
 * Single reactive query pipeline for a bound signal.
 * Watches: semantics[signal].revision, query.filters, query.time, query.rangeTime, query.refreshKey, enabled, params.
 * Skips when !semantics[signal].ready or enabled===false.
 * Signature dedupe: identical JSON signature skips.
 * Stale drop: requestId; ignore results after a newer run started (run() should check via returned controller if needed).
 */
export default function useSignalQuery(
  ctx: DrilldownContext,
  signal: SignalQuerySignal,
  options: UseSignalQueryOptions
): { reload: () => void } {
  let lastSignature = ''
  let requestId = 0
  const forceTick = ref(0)

  const isEnabled = (): boolean => {
    if (options.enabled === undefined) {
      return true
    }
    return Boolean(toValue(options.enabled))
  }

  const buildSignature = (): string => {
    const sem = ctx.semantics[signal]
    return JSON.stringify([
      sem.database.value,
      sem.table.value,
      sem.revision.value,
      (ctx.query.filters.value || []).map((filter) => [filter.key, filter.op, filter.value]),
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.refreshKey.value,
      forceTick.value,
      options.params?.(),
    ])
  }

  const execute = async (): Promise<void> => {
    if (!ctx.semantics[signal].ready.value || !isEnabled()) {
      return
    }
    const signature = buildSignature()
    if (signature === lastSignature) {
      return
    }
    requestId += 1
    const id = requestId
    try {
      await options.run()
    } finally {
      if (id === requestId) {
        lastSignature = signature
      }
    }
  }

  watch(
    () => [
      ctx.semantics[signal].ready.value,
      ctx.semantics[signal].revision.value,
      ctx.semantics[signal].database.value,
      ctx.semantics[signal].table.value,
      (ctx.query.filters.value || []).map((filter) => [filter.key, filter.op, filter.value]),
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.refreshKey.value,
      isEnabled(),
      options.params?.(),
      forceTick.value,
    ],
    () => {
      execute().catch(() => undefined)
    },
    { immediate: true }
  )

  return {
    reload: () => {
      forceTick.value += 1
    },
  }
}
