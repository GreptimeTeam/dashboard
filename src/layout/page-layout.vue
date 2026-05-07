<template lang="pug">
router-view(v-slot="{ Component, route: currentRoute }")
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

  // Build include list from route config: cache routes without `meta.ignoreCache`.
  const keepAliveInclude = computed(() => {
    const includeSet = new Set<string>()
    router
      .getRoutes()
      .filter((route) => !route.meta?.ignoreCache && route.name)
      .forEach((route) => {
        const routeName = String(route.name)
        includeSet.add(routeName)
        includeSet.add(toPascalCase(routeName))
      })
    return Array.from(includeSet)
  })
</script>

<style scoped lang="less"></style>
