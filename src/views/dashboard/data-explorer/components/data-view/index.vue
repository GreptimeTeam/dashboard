<template lang="pug">
template(v-if="!!results.length")
  a-tabs(type="card-gutter" lazy-load :active-key="activeTabKey" @tab-click="tabClick" @delete="deleteTab" editable)
    a-tab-pane(v-for="(item, index) of results" :key="item.index" 
    :title="`${$t('dataExplorer.result')} ${item.index + 1}`" closable) 
      a-card
        template(#title)
          icon-menu
          | {{$t('dataExplorer.table')}}
        DataGrid
      a-card
        template(#title)
          icon-bar-chart
          | {{$t('dataExplorer.chart')}}
        DataChart
</template>

<script lang="ts" setup>
  const { setActiveTabKey, removeResult } = useCodeRunStore()
  const { results, activeTabKey } = storeToRefs(useCodeRunStore())

  const deleteTab = (key: number) => {
    removeResult(key)
  }

  const tabClick = (key: any) => {
    setActiveTabKey(key)
  }
</script>
