<template lang="pug">
router-view(v-slot="{ Component }")
  transition(name="fade" mode="out-in" appear)
    component(v-if="route.meta.ignoreCache" :is="Component")
    keep-alive(v-else)
      component(:is="Component")
</template>

<script lang="ts" setup name="PageLayout">
  import { computed, onMounted, onUnmounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { useTabBarStore } from '@/store'
  import { useDatabases } from '@/hooks/databases'

  const route = useRoute()
  const tabBarStore = useTabBarStore()
  const { initialize, subscribe, cleanup } = useDatabases()

  const cacheList = computed(() => tabBarStore.getCacheList)

  onMounted(() => {
    // 订阅数据变化
    subscribe()
    // 初始化数据
    initialize()
  })

  onUnmounted(() => {
    // 清理订阅
    cleanup()
  })
</script>

<style scoped lang="less"></style>
