import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Query = Record<string, unknown>

/**
 * How a drawer's state maps to the page query string. Keys should be prefixed so they never
 * collide with the page's own params (`builderForm`, `timeRange`, ...).
 */
export interface DrawerUrlCodec<T> {
  /** Every query key the codec reads or writes; changes to any of them re-sync the drawer. */
  keys: readonly string[]
  /** Drawer state in the query, `undefined` when the drawer is closed or the params are invalid. */
  parse: (query: Query) => T | undefined
  /** Query with the drawer params set (`value` given) or removed; other params are kept. */
  serialize: (query: Query, value?: T) => Query
}

/**
 * State of an in-page drawer mirrored into the URL, so a refresh or a shared link reopens it
 * next to the (re-queried) list. The URL stays authoritative: the drawer follows it (e.g.
 * browser back) and the page's own params are left untouched.
 *
 * Only reacts while `routeName` is the active route, so route changes that belong to another
 * page (e.g. while this one is leaving) are ignored.
 */
export default function useDrawerUrlSync<T>(routeName: string, codec: DrawerUrlCodec<T>) {
  const route = useRoute()
  const router = useRouter()

  const state = ref<T>() as Ref<T | undefined>

  function syncFromRoute() {
    if (route.name !== routeName) return
    state.value = codec.parse(route.query)
  }

  function writeRoute(value?: T) {
    if (route.name !== routeName) return
    router.replace({ query: codec.serialize(route.query, value) as Record<string, any> })
  }

  function open(value: T) {
    state.value = value
    writeRoute(value)
  }

  function close() {
    state.value = undefined
    writeRoute()
  }

  watch(() => [route.name, ...codec.keys.map((key) => route.query[key])], syncFromRoute, { immediate: true })

  return { state, open, close }
}
