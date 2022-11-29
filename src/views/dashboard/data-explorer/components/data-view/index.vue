<template lang="pug">
template(v-if="!!resultTabIndex.length")
  a-tabs(type="card-gutter" lazy-load :active-key="activeTabKey" @tab-click="tabClick")
    a-tab-pane(v-for="(item, index) of resultTabIndex" :key="item" :title="'Result ' + (index + 1)" :closable="index !== 2")
      a-tabs(default-active-key="1" type="text")
        a-tab-pane(key="1")
          template(#title)
            icon-menu
            | Table
          DataGrid
        a-tab-pane(key="2")
          template(#title)
            icon-bar-chart
            | Chart
          DataChart
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useCodeRunStore } from '@/store'

  // todo: support delete tab
  const deleteTab = (key: number) => {
    console.log('tabname', key)
  }

  const codeRunStore = useCodeRunStore()
  const { resultTabIndex, activeTabKey } = storeToRefs(codeRunStore)
  const tabClick = (key: any) => {
    activeTabKey.value = key
  }
</script>
