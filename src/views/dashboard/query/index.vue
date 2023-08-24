<template lang="pug">
a-layout.layout
  a-layout-sider(:resize-directions="['right']" :width="321")
    ListTabs(:has="['Tables']")
  a-layout-content
    a-space.content-space(direction="vertical" fill size="large")
      Editor 
      DataView(v-if="!!results?.length" :results="results" :types="types")
      Logs(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Query" setup>
  const { guideModalVisible } = storeToRefs(useAppStore())
  const { getTables } = useDataBaseStore()
  const { dataStatusMap } = storeToRefs(useUserStore())

  const { logs } = storeToRefs(useLogStore())
  const { getResultsByType } = useQueryCode()

  const types = ['sql', 'promQL']

  const results = computed(() => getResultsByType(types))
  const queryLogs = computed(() => logs.value.filter((log) => types.includes(log.type)))

  onActivated(() => {
    if (!guideModalVisible.value) {
      if (!dataStatusMap.value.tables) {
        getTables()
      }
    }
  })

  // TODO: add more code type in the future if needed
</script>
