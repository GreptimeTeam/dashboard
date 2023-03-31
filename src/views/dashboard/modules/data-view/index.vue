<template lang="pug">
a-tabs.result-tabs(type="rounded" lazy-load :active-key="activeTabKey[routeName]" @tab-click="tabClick" @delete="deleteTab" editable :animation="true")
  template(#extra)
    a-button(@click="clearResults()" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(item, index) of results[routeName]" :key="item.key" :title="`${$t('dataExplorer.result')} ${item.key + 1}`" closable) 
    a-space(direction="vertical" fill size="small")
      DataGrid
      DataChart
</template>

<script lang="ts" name="DataView" setup>
  import { useCodeRunStore, useAppStore } from '@/store'

  const route = useRoute()
  const { setActiveTabKey, removeResult, clearResults } = useCodeRunStore()
  const { results, activeTabKey } = storeToRefs(useCodeRunStore())

  const deleteTab = (key: number) => {
    removeResult(key)
  }

  const tabClick = (key: any) => {
    setActiveTabKey(key)
  }

  const routeName = route.name as string
</script>
