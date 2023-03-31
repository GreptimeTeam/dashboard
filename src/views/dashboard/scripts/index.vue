<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill :size="14")
      PyEditor
      DataView(v-if="!!results['scripts'].length")
      Log 
</template>

<script lang="ts" name="Scripts" setup>
  import ListTabs from './list-tabs.vue'

  const { codeType } = storeToRefs(useAppStore())
  const { results } = storeToRefs(useCodeRunStore())

  // TODO: add more code type in the future if needed
  codeType.value = 'python'
</script>
