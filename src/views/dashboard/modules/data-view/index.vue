<template lang="pug">
a-tabs.result-tabs(type="rounded" lazy-load :active-key="activeTabKey[codeType]" @tab-click="tabClick" @delete="deleteTab" editable :animation="true")
  template(#extra)
    a-button(@click="clearResults()" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(item, index) of results[codeType]" :key="item.key" 
  :title="`${$t('dataExplorer.result')} ${item.key + 1}`" closable) 
    a-space(direction="vertical" fill size="small")
      a-card(:bordered="false")
        template(#title)
          a-space(size="mini")
            img(src="/src/assets/images/table.png" height="20")
            | {{$t('dataExplorer.table')}}
        DataGrid
      a-card(:bordered="false")
        template(#title)
          a-space(size="mini")
            svg.card-icon
              use(href="#chart")
            | {{$t('dataExplorer.chart')}}
        DataChart
</template>

<script lang="ts" name="DataView" setup>
  import { useCodeRunStore, useAppStore } from '@/store'

  const { codeType } = storeToRefs(useAppStore())

  const { setActiveTabKey, removeResult, clearResults } = useCodeRunStore()
  const { results, activeTabKey } = storeToRefs(useCodeRunStore())

  const deleteTab = (key: number) => {
    removeResult(key)
  }

  const tabClick = (key: any) => {
    setActiveTabKey(key)
  }
</script>
