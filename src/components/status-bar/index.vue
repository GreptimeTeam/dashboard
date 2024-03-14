import { slice } from 'lodash';
<template lang="pug">
.status-bar
  status-bar-list(:items="statusBarLeft")
  status-bar-list(:items="statusBar")
</template>

<script setup name="StatusBar" lang="ts">
  import { useAppStore } from '@/store'
  import StatusBarList from './status-list.vue'

  const { statusBar, statusBarLeft } = useAppStore()
</script>

<style lang="less" scoped>
  .status-bar {
    background-color: var(--color-white);
    height: 24px;
    line-height: 24px;
    display: flex;
    justify-content: space-between;
  }
</style>
