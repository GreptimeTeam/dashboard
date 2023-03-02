<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill size="large")
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
