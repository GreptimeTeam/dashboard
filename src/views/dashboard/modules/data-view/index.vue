<template lang="pug">
a-tabs.result-tabs(type="rounded" lazy-load :active-key="activeTabKey[routeName]" @tab-click="tabClick" @delete="deleteTab" editable :animation="true")
  template(#extra)
    a-button(@click="clearResults()" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(item, index) of results[routeName]" :key="item.key" :title="`${$t('dataExplorer.result')} ${item.key + 1}`" closable) 
    a-space(direction="vertical" fill size="small")
      DataGrid(:data="currentResult")
      DataChart(:data="currentResult")
</template>

<script lang="ts" name="DataView" setup>
  import { useCodeRunStore, useAppStore } from '@/store'

  const { currentResult } = useCodeRunStore()
  const { routeName } = storeToRefs(useAppStore())

  const { setActiveTabKey, removeResult, clearResults } = useCodeRunStore()
  const { results, activeTabKey } = storeToRefs(useCodeRunStore())

  const deleteTab = (key: number) => {
    removeResult(key)
  }

  const tabClick = (key: any) => {
    setActiveTabKey(key)
  }
</script>
