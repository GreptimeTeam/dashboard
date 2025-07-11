<template lang="pug">
router-view(v-slot="{ Component }")
  transition(name="fade" mode="out-in" appear)
    component(v-if="route.meta.ignoreCache" :is="Component" :database="appStore.database")
    keep-alive(v-else)
      component(:is="Component" :database="appStore.database")
</template>

<script lang="ts" setup name="PageLayout">
  import { computed } from 'vue'
  import { useTabBarStore } from '@/store'

  const route = useRoute()
  const tabBarStore = useTabBarStore()
  const appStore = useAppStore()

  const cacheList = computed(() => tabBarStore.getCacheList)
</script>

<style scoped lang="less"></style>
