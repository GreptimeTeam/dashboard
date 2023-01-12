<template lang="pug">
a-layout.layout-container
  .layout-navbar(v-if='navbar')
    NavBar
  a-layout-content(:style='paddingStyle')
    PageLayout
  Footer(v-if="footer")
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useAppStore } from '@/store'
  import NavBar from '@/components/navbar/index.vue'
  import Footer from '@/components/footer/index.vue'
  import useResponsive from '@/hooks/responsive'
  import PageLayout from './page-layout.vue'

  const appStore = useAppStore()
  useResponsive(true)
  const navbarHeight = `52px`
  const navbar = computed(() => appStore.navbar)
  const footer = computed(() => appStore.footer)

  const paddingStyle = computed(() => {
    const paddingTop = navbar.value ? { paddingTop: navbarHeight } : {}
    return { ...paddingTop }
  })
</script>

<style scoped lang="less">
  @nav-size-height: 52px;

  .layout-container {
    width: 100%;
    height: 100%;
  }

  .layout-navbar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
    width: 100%;
    height: @nav-size-height;
  }

  .layout-content {
    overflow-y: hidden;
    transition: padding 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
  }
</style>
