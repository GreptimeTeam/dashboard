<template lang="pug">
a-layout.layout-container
  a-layout-sider.main-sider(:width="258")
    Navbar(v-if="navbar")
  a-layout-content.layout-content
    PageLayout
  Footer(v-if="footer")
  QueryModal
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useAppStore } from '@/store'
  import NavBar from '@/components/navbar/index.vue'
  import Footer from '@/components/footer/index.vue'
  import useResponsive from '@/hooks/responsive'
  import PageLayout from './page-layout.vue'

  useResponsive(true)
  const navbarHeight = `52px`

  const { navbar, footer, username, password, database, codeType } = storeToRefs(useAppStore())
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

  .arco-layout-sider-light.main-sider {
    box-shadow: 4px 0px 10px 0px rgba(131, 34, 255, 0.08);
  }
</style>
