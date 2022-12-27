<template lang="pug">
a-tabs(type="rounded" lazy-load :active-key="activeTabKey" @tab-click="tabClick" @delete="deleteTab" editable)
  template(#extra)
    a-button(@click="clearCodeResult()" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(item, index) of results" :key="item.key" 
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

<script lang="ts" setup>
  const { setActiveTabKey, removeResult } = useCodeRunStore()
  const { results, activeTabKey } = storeToRefs(useCodeRunStore())

  const deleteTab = (key: number) => {
    removeResult(key)
  }

  const tabClick = (key: any) => {
    setActiveTabKey(key)
  }

  const clearCodeResult = () => {
    useCodeRunStore().$reset()
  }
</script>
