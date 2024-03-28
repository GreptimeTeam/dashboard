<template lang="pug">
router-view(v-slot="{ Component }")
  transition(name="fade" mode="out-in" appear)
    component(v-if="route.meta.ignoreCache" :is="Component")
    keep-alive(v-else)
      component(:is="Component")
</template>

<script lang="ts" setup name="PageLayout">
  import { computed } from 'vue'
  import { useTabBarStore } from '@/store'

  const route = useRoute()
  const tabBarStore = useTabBarStore()

  const cacheList = computed(() => tabBarStore.getCacheList)
</script>

<style scoped lang="less"></style>
