import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { traceDrawerFromQuery, traceDrawerToQuery, type TraceDetailTarget } from './trace-detail-target'

/**
 * State of the trace drawer on a list page (Logs Query / Traces Query), mirrored into the
 * URL so a refresh or a shared link reopens the same trace. The URL stays authoritative:
 * the drawer follows it (e.g. browser back), and the list's own params are left untouched.
 *
 * Route changes that belong to another page (e.g. while this one is leaving) are ignored.
 */
export default function useTraceDrawerUrlSync(routeName: string) {
  const route = useRoute()
  const router = useRouter()

  const traceId = ref('')
  const target = ref<TraceDetailTarget>()

  function syncFromRoute() {
    if (route.name !== routeName) return
    const parsed = traceDrawerFromQuery(route.query)
    traceId.value = parsed?.traceId ?? ''
    target.value = parsed?.target
  }

  function writeRoute(id: string, next?: TraceDetailTarget) {
    if (route.name !== routeName) return
    router.replace({ query: traceDrawerToQuery(route.query, id, next) as Record<string, any> })
  }

  function open(id: string, next: TraceDetailTarget) {
    traceId.value = id
    target.value = next
    writeRoute(id, next)
  }

  function close() {
    traceId.value = ''
    writeRoute('')
  }

  watch(
    () => [
      route.name,
      route.query.traceId,
      route.query.traceTable,
      route.query.traceDb,
      route.query.traceStart,
      route.query.traceEnd,
    ],
    syncFromRoute,
    { immediate: true }
  )

  return { traceId, target, open, close }
}
