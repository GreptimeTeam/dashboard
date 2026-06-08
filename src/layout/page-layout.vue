<template lang="pug">
router-view(v-slot="{ Component }")
  keep-alive(:include="keepAliveInclude")
    component(:is="Component" :database="appStore.database")
</template>

<script lang="ts" setup name="PageLayout">
  import { computed } from 'vue'

  const router = useRouter()
  const appStore = useAppStore()
  const toPascalCase = (value: string) =>
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')

  /** 路由名 toPascalCase 与 SFC name 不一致时，在此补充要缓存的组件名 */
  const INCLUDE_NAME_ALIASES: Record<string, string[]> = {}

  // 仅缓存 meta.keepAlive 为 true 的路由（推导组件名 + 已知别名）
  const keepAliveInclude = computed(() => {
    const includeSet = new Set<string>()
    router.getRoutes().forEach((route) => {
      if (!route.meta?.keepAlive || !route.name) return
      const routeName = String(route.name)
      includeSet.add(toPascalCase(routeName))
      ;(INCLUDE_NAME_ALIASES[routeName] || []).forEach((alias) => includeSet.add(alias))
    })
    return Array.from(includeSet)
  })
</script>

<style scoped lang="less"></style>
