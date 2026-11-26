import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import type { DrilldownContext } from './context'
import useSignalQuery from './use-signal-query'

function makeCtx(options?: {
  ready?: boolean
  revision?: number
  signal?: 'logs' | 'traces'
  logsView?: 'overview' | 'detail'
}) {
  const signal = options?.signal ?? 'traces'
  const ready = ref(options?.ready ?? false)
  const revision = ref(options?.revision ?? 0)
  const defaultTable = signal === 'logs' ? 'otlp_logs' : 'opentelemetry_traces'
  const table = ref(ready.value ? defaultTable : undefined)
  const database = ref('public')
  const filters = ref<{ key: string; op: string; value: string }[]>([])
  const time = ref(3600)
  const rangeTime = ref(['', ''])
  const refreshKey = ref(0)
  const logsView = ref(options?.logsView ?? 'overview')
  const logsTraceId = ref<string | undefined>()

  const logsSem = {
    database: signal === 'logs' ? database : ref(undefined),
    table: signal === 'logs' ? table : ref(undefined),
    revision: signal === 'logs' ? revision : ref(0),
    ready: computed(() => (signal === 'logs' ? ready.value : false)),
  }
  const tracesSem = {
    database: signal === 'traces' ? database : ref(undefined),
    table: signal === 'traces' ? table : ref(undefined),
    revision: signal === 'traces' ? revision : ref(0),
    ready: computed(() => (signal === 'traces' ? ready.value : false)),
    columns: ref(signal === 'traces' && ready.value ? ['trace_id'] : undefined),
  }

  return {
    ctx: {
      semantics: {
        traces: tracesSem,
        logs: logsSem,
      },
      query: {
        filters,
        time,
        rangeTime,
        refreshKey,
      },
      ui: {
        logsView,
        logsTraceId,
      },
    } as unknown as DrilldownContext,
    ready,
    revision,
    filters,
    refreshKey,
    logsView,
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

  it('does not re-query on logs overview when filters change (compose / Include)', async () => {
    const { ctx, filters } = makeCtx({ ready: true, revision: 1, signal: 'logs', logsView: 'overview' })
    const run = vi.fn()
    useSignalQuery(ctx, 'logs', { run })
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)

    filters.value = [{ key: 'service_name', op: '=', value: 'checkout' }]
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('re-queries on logs detail when filters change', async () => {
    const { ctx, filters } = makeCtx({ ready: true, revision: 1, signal: 'logs', logsView: 'detail' })
    const run = vi.fn()
    useSignalQuery(ctx, 'logs', { run })
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)

    filters.value = [{ key: 'service_name', op: '=', value: 'checkout' }]
    await nextTick()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
