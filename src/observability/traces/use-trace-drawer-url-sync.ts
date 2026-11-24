import { computed } from 'vue'
import useDrawerUrlSync, { type DrawerUrlCodec } from '@/hooks/use-drawer-url-sync'
import {
  TRACE_DRAWER_QUERY_KEYS,
  traceDrawerFromQuery,
  traceDrawerToQuery,
  type TraceDetailTarget,
} from './trace-detail-target'

type TraceDrawerState = NonNullable<ReturnType<typeof traceDrawerFromQuery>>

const traceDrawerCodec: DrawerUrlCodec<TraceDrawerState> = {
  keys: TRACE_DRAWER_QUERY_KEYS,
  parse: traceDrawerFromQuery,
  serialize: (query, value) => traceDrawerToQuery(query, value?.traceId ?? '', value?.target),
}

/**
 * Trace drawer on a list page (Logs Query / Traces Query), mirrored into the URL via
 * `useDrawerUrlSync` so a refresh or a shared link reopens the same trace.
 */
export default function useTraceDrawerUrlSync(routeName: string) {
  const { state, open, close } = useDrawerUrlSync(routeName, traceDrawerCodec)

  return {
    traceId: computed(() => state.value?.traceId ?? ''),
    target: computed<TraceDetailTarget | undefined>(() => state.value?.target),
    open: (traceId: string, target: TraceDetailTarget) => open({ traceId, target }),
    close,
  }
}
