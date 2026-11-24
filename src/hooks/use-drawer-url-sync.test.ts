import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import useDrawerUrlSync, { type DrawerUrlCodec } from './use-drawer-url-sync'

const route = reactive<{ name: string; query: Record<string, unknown> }>({ name: 'page', query: {} })
const replace = vi.fn(({ query }: { query: Record<string, unknown> }) => {
  route.query = query
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

const codec: DrawerUrlCodec<{ id: string }> = {
  keys: ['drawerId'],
  parse: (query) => (typeof query.drawerId === 'string' && query.drawerId ? { id: query.drawerId } : undefined),
  serialize: (query, value) => {
    const next = { ...query }
    delete next.drawerId
    if (value) next.drawerId = value.id
    return next
  },
}

describe('useDrawerUrlSync', () => {
  beforeEach(() => {
    route.name = 'page'
    route.query = {}
    replace.mockClear()
  })

  it('restores the drawer from the URL on setup', () => {
    route.query = { drawerId: 'a', keep: '1' }
    const { state } = useDrawerUrlSync('page', codec)
    expect(state.value).toEqual({ id: 'a' })
  })

  it('open writes the URL and keeps the page params', async () => {
    route.query = { keep: '1' }
    const { state, open } = useDrawerUrlSync('page', codec)
    open({ id: 'b' })
    await nextTick()
    expect(state.value).toEqual({ id: 'b' })
    expect(route.query).toEqual({ keep: '1', drawerId: 'b' })
  })

  it('close clears the drawer params only', async () => {
    route.query = { drawerId: 'a', keep: '1' }
    const { state, close } = useDrawerUrlSync('page', codec)
    close()
    await nextTick()
    expect(state.value).toBeUndefined()
    expect(route.query).toEqual({ keep: '1' })
  })

  it('follows URL changes such as browser back', async () => {
    const { state } = useDrawerUrlSync('page', codec)
    route.query = { drawerId: 'c' }
    await nextTick()
    expect(state.value).toEqual({ id: 'c' })
    route.query = {}
    await nextTick()
    expect(state.value).toBeUndefined()
  })

  it('ignores routes that belong to another page', async () => {
    route.query = { drawerId: 'a' }
    const { state, open } = useDrawerUrlSync('page', codec)
    route.name = 'other'
    route.query = {}
    await nextTick()
    expect(state.value).toEqual({ id: 'a' })
    open({ id: 'z' })
    expect(replace).not.toHaveBeenCalled()
  })
})
