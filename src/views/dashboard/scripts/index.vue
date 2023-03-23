<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill :size="14")
      PyEditor
      DataView(v-if="!!results[routeName].length")
      Logs
</template>

<script lang="ts" name="Scripts" setup>
  import ListTabs from './list-tabs.vue'

  const { codeType, routeName } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())

  // TODO: add more code type in the future if needed
  codeType.value = 'python'
</script>
