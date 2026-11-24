import { computed } from 'vue'
import useDrawerUrlSync, { type DrawerUrlCodec } from '@/hooks/use-drawer-url-sync'
import {
  TRACE_DRAWER_QUERY_KEYS,
  TRACE_LOGS_DRAWER_QUERY_KEYS,
  traceDrawerFromQuery,
  traceDrawerToQuery,
  traceLogsDrawerFromQuery,
  traceLogsDrawerToQuery,
  type TraceDetailTarget,
  type TraceDrawerState,
} from './trace-detail-target'

/** `trace`: the trace timeline drawer; `logs`: the logs of that trace, opened from it. */
export type TraceDrawerKind = 'trace' | 'logs'

const CODECS: Record<TraceDrawerKind, DrawerUrlCodec<TraceDrawerState>> = {
  trace: {
    keys: TRACE_DRAWER_QUERY_KEYS,
    parse: traceDrawerFromQuery,
    serialize: (query, value) => traceDrawerToQuery(query, value?.traceId ?? '', value?.target),
  },
  logs: {
    keys: TRACE_LOGS_DRAWER_QUERY_KEYS,
    parse: traceLogsDrawerFromQuery,
    serialize: (query, value) => traceLogsDrawerToQuery(query, value?.traceId ?? '', value?.target),
  },
}

/**
 * Trace or trace-logs drawer on a list page (Logs Query / Traces Query), mirrored into the
 * URL via `useDrawerUrlSync` so a refresh or a shared link reopens the same drawer.
 */
export default function useTraceDrawerUrlSync(routeName: string, kind: TraceDrawerKind = 'trace') {
  const { state, open, close } = useDrawerUrlSync(routeName, CODECS[kind])

  return {
    traceId: computed(() => state.value?.traceId ?? ''),
    target: computed<TraceDetailTarget | undefined>(() => state.value?.target),
    open: (traceId: string, target: TraceDetailTarget) => open({ traceId, target }),
    close,
  }
}
