import type { DrilldownActions, SignalSemanticSnapshot } from './context'
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
 * Trace→Logs overlay runtime. The overlay borrows the page-level `semantics.logs` slot,
 * so this state tracks when that slot holds an overlay binding instead of the page one:
 * URL sync mirrors `targetTable` into `logsTable` while active, and the page binding is
 * snapshotted / restored around it. A hydrate that arrives before the binder is ready
 * queues its open in `pending`; `initialize('logs')` flushes it after the page bind so
 * the snapshot captures the real page binding.
 */
export interface OverlayLogsState {
  active: boolean
  targetTable?: string
  pageSnapshot?: SignalSemanticSnapshot
  pending?: { traceId: string; database?: string; table?: string }
}

/**
 * Mutable runtime owned by one Explore page instance. Created with the Context and
 * disposed on unmount, so re-entering Explore starts from the same state as a cold load.
 */
export interface DrilldownSession {
  binding: SignalBindingRuntime
  traceLogs: TraceLogsRuntime
  overlayLogs: OverlayLogsState
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
  const overlayLogs: OverlayLogsState = { active: false }

  const clearOverlayLogs = () => {
    overlayLogs.active = false
    overlayLogs.targetTable = undefined
    overlayLogs.pageSnapshot = undefined
    overlayLogs.pending = undefined
  }

  return {
    binding,
    traceLogs,
    overlayLogs,
    dispose() {
      binding.ready = false
      binding.impl = undefined
      traceLogs.clear()
      clearOverlayLogs()
    },
  }
}
