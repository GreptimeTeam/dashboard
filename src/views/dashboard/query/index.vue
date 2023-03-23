<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill size="large")
      Editor 
      DataView(v-if="!!results[routeName].length")
      Logs
</template>

<script lang="ts" name="Query" setup>
  import ListTabs from '../scripts/list-tabs.vue'

  const { results } = storeToRefs(useCodeRunStore())
  const { codeType, routeName } = storeToRefs(useAppStore())

  // TODO: add more code type in the future if needed
  codeType.value = 'sql'
</script>
