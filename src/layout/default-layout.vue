<template lang="pug">
a-layout.app-layout
  a-layout.layout-container(
    :class="{ 'layout-container--no-footer': !footer || queryFocusMode, 'layout-container--query-focus': queryFocusMode }"
  )
    a-layout-sider.main-sider(v-if="navbar" :width="siderWidth")
      Navbar
    a-layout-content.layout-content(
      :class="{ 'layout-content--full-bleed': !navbar, 'layout-content--query-focus': queryFocusMode }"
    )
      PageLayout
  Footer(v-show="footer && !queryFocusMode")
</template>

<script lang="ts" setup>
  import { useNavbarLayoutCollapsed, useQueryFocusMode } from '@/composables/use-query-focus-mode'
  import { useAppStore } from '@/store'
  import Footer from '@/components/footer/index.vue'
  import useResponsive from '@/hooks/responsive'
  import PageLayout from './page-layout.vue'

  useResponsive(true)

  const { navbar, footer } = storeToRefs(useAppStore())
  const queryFocusMode = useQueryFocusMode()
  const navbarCollapsed = useNavbarLayoutCollapsed()
  const siderWidth = computed(() => (navbarCollapsed.value ? 54 : 200))

  watchEffect(() => {
    if (!navbar.value) {
      document.documentElement.style.setProperty('--navbar-current-width', '0px')
      return
    }
    const width = navbarCollapsed.value ? 'var(--navbar-width-collapsed)' : 'var(--navbar-width)'
    document.documentElement.style.setProperty('--navbar-current-width', width)
  })
</script>

<style scoped lang="less">
  @nav-size-height: 52px;

  .app-layout {
    height: 100%;
    flex-direction: column;
  }

  .layout-container {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    height: calc(100% - var(--footer-height));

    &.layout-container--no-footer {
      height: 100%;
    }
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
    width: calc(100vw - var(--navbar-current-width));
    max-width: 100%;
    overflow-x: hidden;
    overflow-y: hidden;
    border-left: 1px solid var(--gpt-border-default);
    transition: width 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
  }

  .layout-container--query-focus .layout-content,
  .layout-content.layout-content--query-focus {
    transition: none;
  }

  .layout-content.layout-content--full-bleed {
    width: 100%;
    border-left: none;
  }
</style>
