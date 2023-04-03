<template lang="pug">
a-layout.layout
  a-layout-sider
    ListTabs
  a-layout-content
    a-space.content-space(direction="vertical" fill size="large")
      Editor 
      DataView(v-if="!!results?.length" :results="results")
      Logs(:logs="queryLogs")
</template>

<script lang="ts" name="Query" setup>
  import ListTabs from '../scripts/list-tabs.vue'

  const { getResultsByType } = useQueryCode()
  const { logs } = storeToRefs(useLogStore())

  const queryLogs = computed(() => logs.value.filter((log) => ['sql', 'promQL'].includes(log.type)))
  const results = computed(() => getResultsByType(['sql', 'promQL']))

  // TODO: add more code type in the future if needed
</script>
