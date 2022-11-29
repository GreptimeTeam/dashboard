<template lang="pug">
template(v-if="!!resultTabIndex.length")
  a-tabs(type="card-gutter" lazy-load :active-key="activeTabKey" @tab-click="tabClick" @delete="deleteTab" editable)
    a-tab-pane(v-for="(item, index) of resultTabIndex" :key="item" :title="'Result ' + (index + 1)" closable)
      a-card
        template(#title)
          icon-menu
          | Table
        DataGrid
      a-card
        template(#title)
          icon-bar-chart
          | Chart
        DataChart
</template>

<script lang="ts" setup>
  const { resultTabIndex, activeTabKey } = useCodeRunStore()
  const totalPanel = ref(0)

  const deleteTab = (key: number) => {
    console.log('tabname', key)
  }

  const tabClick = (key: any) => {
    activeTabKey.value = key
  }
</script>
