<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in" appear>
      <component :is="Component" v-if="route.meta.ignoreCache" :key="route.fullPath" />
      <keep-alive v-else>
        <component :is="Component" :key="route.name" />
      </keep-alive>
    </transition>
  </router-view>
</template>

<script lang="ts" setup name="PageLayout">
  import { computed } from 'vue'
  import { useTabBarStore } from '@/store'

  const route = useRoute()
  const tabBarStore = useTabBarStore()

  const cacheList = computed(() => tabBarStore.getCacheList)
</script>

<style scoped lang="less"></style>
