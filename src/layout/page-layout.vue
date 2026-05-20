<template lang="pug">
router-view(v-slot="{ Component }")
  keep-alive(:exclude="keepAliveExclude")
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

  /**
   * 路由名 `toPascalCase` 与 SFC `defineOptions({ name })` 不一致时，在此补充要排除缓存的组件名。
   * 白名单 include 容易漏配导致整页不缓存（每次进入都 remount）；exclude 更符合 ignoreCache 语义。
   */
  const EXCLUDE_NAME_ALIASES: Record<string, string[]> = {
    'log-query': ['LogsQuery'],
  }

  // 不缓存：meta.ignoreCache 为 true 的路由（路由名 + 推导名 + 已知别名）
  const keepAliveExclude = computed(() => {
    const excludeSet = new Set<string>()
    router.getRoutes().forEach((route) => {
      if (!route.meta?.ignoreCache || !route.name) return
      const routeName = String(route.name)
      excludeSet.add(routeName)
      excludeSet.add(toPascalCase(routeName))
      ;(EXCLUDE_NAME_ALIASES[routeName] || []).forEach((alias) => excludeSet.add(alias))
    })
    return Array.from(excludeSet)
  })
</script>

<style scoped lang="less"></style>
