<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill :size="14")
      PyEditor
      DataView(v-if="!!results?.length" :results="results")
      Logs
</template>

<script lang="ts" name="Scripts" setup>
  import ListTabs from './list-tabs.vue'

  const { getResultsByType } = useQueryCode()

  const results = computed(() => getResultsByType(['python']))

  // TODO: add more code type in the future if needed
</script>
