<template lang="pug">
a-tabs(type="rounded" lazy-load :active-key="activeTabKey[codeType]" @tab-click="tabClick" @delete="deleteTab" editable)
  template(#extra)
    a-button(@click="clearResults()" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(item, index) of results[codeType]" :key="item.key" 
  :title="`${$t('dataExplorer.result')} ${item.key + 1}`" closable) 
    a-space(direction="vertical" fill :size="14")
      a-card(:bordered="false")
        template(#title)
          svg.card-icon
            use(href="#table")
          | {{$t('dataExplorer.table')}}
        DataGrid
      a-card(:bordered="false")
        template(#title)
          svg.card-icon
            use(href="#chart")
          | {{$t('dataExplorer.chart')}}
        DataChart
</template>

<script lang="ts" name="DataView" setup>
  import router from '@/router'
  import { useCodeRunStore } from '@/store'

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
