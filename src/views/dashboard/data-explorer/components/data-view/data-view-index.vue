<template>
  <a-tabs
    type="card-gutter"
    :editable="true"
    @delete="deleteTab"
    :auto-switch="true"
    lazy-load
    :active-key="activeTabKey"
    @tab-click="tabClick"
  >
    <a-tab-pane
      v-for="(item, index) of resultTabIndex"
      :key="item"
      :title="'Result ' + (index + 1)"
      :closable="index !== 2"
    >
      <a-tabs default-active-key="1" type="text">
        <a-tab-pane key="1">
          <template #title> <icon-menu /> Table </template>
          <DataGrid />
        </a-tab-pane>
        <a-tab-pane key="2">
          <template #title> <icon-bar-chart /> Chart </template>
          <DataChart />
        </a-tab-pane>
      </a-tabs>
    </a-tab-pane>
  </a-tabs>
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useCodeRunStore } from '@/store'
  import DataGrid from './components/data-grid.vue'
  import DataChart from './components/data-chart.vue'

  const deleteTab = (key: number) => {
    console.log('tabname', key)
  }

  const codeRunStore = useCodeRunStore()
  const { resultTabIndex, activeTabKey } = storeToRefs(codeRunStore)
  const tabClick = (key: any) => {
    activeTabKey.value = key
  }
</script>
