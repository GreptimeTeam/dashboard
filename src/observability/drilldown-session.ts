import type { DrilldownActions } from './context'
import type { TraceLogsResolution } from './traces/logs-association'

/** Actions only the binder can implement; Context forwards to them once installed. */
export type SignalBindingImpl = Pick<
  DrilldownActions,
  'bindTable' | 'openLogsForTrace' | 'closeLogsForTrace' | 'setLogsRole'
>

export interface SignalBindingRuntime {
  /** True once the binder ran its first `initialize`; URL sync binds instead of stamping the table. */
  ready: boolean
  impl: SignalBindingImpl | undefined
}

/** Trace→Logs caches. Keys carry database + time window; entries die with the page. */
export interface TraceLogsRuntime {
  probeVerdicts: Map<string, Promise<boolean>>
  inflightResolves: Map<string, Promise<TraceLogsResolution>>
  traceServices: Map<string, Promise<string[]>>
  clear(): void
}

/**
 * Mutable runtime owned by one Explore page instance. Created with the Context and
 * disposed on unmount, so re-entering Explore starts from the same state as a cold load.
 */
export interface DrilldownSession {
  binding: SignalBindingRuntime
  traceLogs: TraceLogsRuntime
  dispose(): void
}

export default function createDrilldownSession(): DrilldownSession {
  const traceLogs: TraceLogsRuntime = {
    probeVerdicts: new Map(),
    inflightResolves: new Map(),
    traceServices: new Map(),
    clear() {
      traceLogs.probeVerdicts.clear()
      traceLogs.inflightResolves.clear()
      traceLogs.traceServices.clear()
    },
  }
  const binding: SignalBindingRuntime = { ready: false, impl: undefined }

  return {
    binding,
    traceLogs,
    dispose() {
      binding.ready = false
      binding.impl = undefined
      traceLogs.clear()
    },
  }
}
