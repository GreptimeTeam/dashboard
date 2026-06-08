<template lang="pug">
router-view(v-slot="{ Component, route }")
  //- include 白名单：仅 meta.keepAlive 且 componentName 匹配的组件会缓存；详情等非白名单页面正常渲染但不缓存
  keep-alive(:include="keepAliveInclude")
    component(
      v-if="Component"
      :key="route.name"
      :is="Component"
      :database="appStore.database"
    )
</template>

<script lang="ts" setup name="PageLayout">
  import { computed } from 'vue'

  const router = useRouter()
  const appStore = useAppStore()

  // 使用路由 meta.componentName（与 SFC defineOptions name 一致），避免路由名推导与组件名不一致
  const keepAliveInclude = computed(() => {
    const includeSet = new Set<string>()
    router.getRoutes().forEach((route) => {
      if (!route.meta?.keepAlive || !route.name) return
      const { componentName } = route.meta
      if (typeof componentName === 'string' && componentName) {
        includeSet.add(componentName)
      }
    })
    return Array.from(includeSet)
  })
</script>

<style scoped lang="less"></style>
