import { useI18n } from 'vue-i18n'
import { RouteRecordRaw } from 'vue-router'
import useMenuTree from '@/components/menu/use-menu-tree'
import useLocale from '@/hooks/locale'
import type { CommandPaletteItem, CommandPaletteSection } from './types'

function flattenRoutes(
  routes: RouteRecordRaw[],
  resolver: (name: string) => string,
  t: (key: string) => string
): CommandPaletteItem[] {
  const result: CommandPaletteItem[] = []

  function walk(items: RouteRecordRaw[], parentTitle?: string) {
    items.forEach((r) => {
      const name = r.name as string | undefined
      if (!name) return

      const path = resolver(name)
      if (path.includes(':')) return

      const locale = r.meta?.locale as string | undefined
      const currentTitle = locale ? t(locale) : undefined
      const displayTitle = parentTitle && currentTitle ? `${parentTitle} > ${currentTitle}` : currentTitle

      if (displayTitle) {
        result.push({
          kind: 'route',
          id: `route:${name}`,
          title: displayTitle,
          path,
          routeName: name,
        })
      }

      if (r.children?.length) {
        walk(r.children, currentTitle || parentTitle)
      }
    })
  }

  walk(routes)
  return result
}

function scoreItem(item: CommandPaletteItem, term: string): number {
  if (!term) return 1

  const titleLower = item.title.toLowerCase()
  const hint = item.kind === 'ui' || item.kind === 'group' ? (item as any).hint?.toLowerCase() ?? '' : ''

  if (titleLower === term) return 100
  if (hint && hint === term) return 90
  if (titleLower.startsWith(term)) return 80
  if (hint && hint.startsWith(term)) return 70
  if (titleLower.includes(term)) return 60
  if (hint && hint.includes(term)) return 50

  return 0
}

// eslint-disable-next-line import/prefer-default-export
export function useCommandPalette() {
  const router = useRouter()
  const appStore = useAppStore()
  const { t } = useI18n()
  const { menuTree } = useMenuTree()
  const { currentLocale, onChangeLocale } = useLocale()

  const visible = ref(false)
  const query = ref('')
  const activeStack = ref<CommandPaletteItem[]>([])

  const open = () => {
    visible.value = true
    query.value = ''
    activeStack.value = []
  }

  const close = () => {
    visible.value = false
  }

  const routeItems = computed<CommandPaletteItem[]>(() => {
    const routes = menuTree.value?.[0]?.children ?? []
    const resolve = (name: string) => {
      try {
        return router.resolve({ name }).path
      } catch {
        return ''
      }
    }
    return flattenRoutes(routes as RouteRecordRaw[], resolve, t)
  })

  const uiItems = computed<CommandPaletteItem[]>(() => [
    {
      kind: 'ui' as const,
      id: 'ui:settings',
      title: t('settings.title'),
      hint: 'Open settings drawer',
      navigate: () => appStore.openGlobalSettings(),
    },
    {
      kind: 'ui' as const,
      id: 'ui:locale:en-US',
      title: 'English',
      hint: 'Switch language to English',
      navigate: () => {
        if (currentLocale.value !== 'en-US') {
          currentLocale.value = 'en-US'
          onChangeLocale()
        }
      },
    },
    {
      kind: 'ui' as const,
      id: 'ui:locale:zh-CN',
      title: '中文',
      hint: 'Switch language to 中文',
      navigate: () => {
        if (currentLocale.value !== 'zh-CN') {
          currentLocale.value = 'zh-CN'
          onChangeLocale()
        }
      },
    },
    {
      kind: 'ui' as const,
      id: 'ui:create:flow',
      title: 'New Flow',
      hint: 'Create a new flow task',
      navigate: () => router.push({ name: 'flow', query: { create: '1' } }),
    },
    {
      kind: 'ui' as const,
      id: 'ui:create:perses',
      title: 'New Dashboard',
      hint: 'Create a new Perses dashboard',
      navigate: () => router.push({ name: 'perses', query: { create: '1' } }),
    },
    {
      kind: 'ui' as const,
      id: 'ui:create:pipeline',
      title: 'New Pipeline',
      hint: 'Create a new log pipeline',
      navigate: () => router.push({ name: 'log-pipeline', query: { create: '1' } }),
    },
  ])

  const currentParent = computed(() =>
    activeStack.value.length ? activeStack.value[activeStack.value.length - 1] : null
  )

  const currentItems = computed(() => {
    const parent = currentParent.value
    if (parent && parent.kind === 'group') return parent.children
    return [...routeItems.value, ...uiItems.value]
  })

  const filteredSections = computed<CommandPaletteSection[]>(() => {
    const term = query.value.trim().toLowerCase()
    const items = currentItems.value

    const scored = items
      .map((item) => ({ item, score: scoreItem(item, term) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)

    if (currentParent.value) {
      return [{ label: currentParent.value.title, items: scored.map((s) => s.item) }]
    }

    const routes = scored.filter((s) => s.item.kind === 'route').map((s) => s.item)
    const actions = scored.filter((s) => s.item.kind !== 'route').map((s) => s.item)

    const sections: CommandPaletteSection[] = []
    if (routes.length) sections.push({ label: 'Pages', items: routes })
    if (actions.length) sections.push({ label: 'Actions', items: actions })
    return sections
  })

  const flatFiltered = computed(() => filteredSections.value.flatMap((s) => s.items))

  const selectedIndex = ref(0)

  watch([query, currentParent], () => {
    selectedIndex.value = 0
  })

  const select = (item: CommandPaletteItem) => {
    if (item.kind === 'group') {
      activeStack.value = [...activeStack.value, item]
      query.value = ''
      return
    }
    close()
    if (item.kind === 'route') {
      router.push({ name: item.routeName })
    } else {
      item.navigate()
    }
  }

  const goBack = () => {
    if (activeStack.value.length) {
      activeStack.value = activeStack.value.slice(0, -1)
      query.value = ''
    }
  }

  const onKeydown = (e: KeyboardEvent) => {
    const items = flatFiltered.value
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedIndex.value = (selectedIndex.value + 1) % (items.length || 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedIndex.value = (selectedIndex.value - 1 + (items.length || 1)) % (items.length || 1)
        break
      case 'Enter':
        e.preventDefault()
        if (items[selectedIndex.value]) select(items[selectedIndex.value])
        break
      case 'Backspace':
        if (!query.value && activeStack.value.length) {
          e.preventDefault()
          goBack()
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      default:
        break
    }
  }

  return {
    visible,
    query,
    filteredSections,
    flatFiltered,
    selectedIndex,
    currentParent,
    open,
    close,
    select,
    goBack,
    onKeydown,
  }
}
