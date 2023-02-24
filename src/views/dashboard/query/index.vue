<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space(direction="vertical" fill size="large")
      Editor 
      DataView(v-if="!!results.sql.length")
      Log 
</template>

<script lang="ts" name="DataExplorer" setup>
  import ListTabs from '../scripts/list-tabs.vue'

  const { getTables: refreshTableData } = useDataBaseStore()
  const { results } = storeToRefs(useCodeRunStore())
  const { codeType } = storeToRefs(useAppStore())

  // TODO: add more code type in the future if needed
  codeType.value = 'sql'
</script>

<style lang="less" scoped>
  .left-side {
    flex: 1;
    overflow: auto;
  }

  .right-side {
    width: 280px;
    margin-left: 16px;
  }
</style>

<style lang="less" scoped>
  // responsive
  .mobile {
    .container {
      display: block;
    }

    .right-side {
      // display: none;
      width: 100%;
      margin-left: 0;
      margin-top: 16px;
    }
  }
</style>
