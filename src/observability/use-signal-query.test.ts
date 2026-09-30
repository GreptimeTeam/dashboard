import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import type { DrilldownContext } from './context'
import useSignalQuery from './use-signal-query'

function makeCtx(options?: { ready?: boolean; revision?: number }) {
  const ready = ref(options?.ready ?? false)
  const revision = ref(options?.revision ?? 0)
  const table = ref(ready.value ? 'opentelemetry_traces' : undefined)
  const database = ref('public')
  const filters = ref<{ key: string; op: string; value: string }[]>([])
  const time = ref(3600)
  const rangeTime = ref(['', ''])
  const refreshKey = ref(0)

  return {
    ctx: {
      semantics: {
        traces: {
          database,
          table,
          revision,
          ready: computed(() => ready.value),
          columns: ref(ready.value ? ['trace_id'] : undefined),
        },
        logs: {
          database: ref(undefined),
          table: ref(undefined),
          revision: ref(0),
          ready: computed(() => false),
        },
      },
      query: {
        filters,
        time,
        rangeTime,
        refreshKey,
      },
    } as unknown as DrilldownContext,
    ready,
    revision,
    filters,
    refreshKey,
  }
}

describe('useSignalQuery', () => {
  it('skips run when semantics are not ready', async () => {
    const { ctx } = makeCtx({ ready: false })
    const run = vi.fn()
    useSignalQuery(ctx, 'traces', { run })
    await nextTick()
    expect(run).not.toHaveBeenCalled()
  })

  it('runs once for identical signatures and again when revision changes', async () => {
    const { ctx, ready, revision } = makeCtx({ ready: true, revision: 1 })
    const run = vi.fn()
    useSignalQuery(ctx, 'traces', { run })
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)

    // Readiness flap with the same bind signature must not re-fetch.
    ready.value = false
    await nextTick()
    ready.value = true
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)

    revision.value = 2
    await nextTick()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
