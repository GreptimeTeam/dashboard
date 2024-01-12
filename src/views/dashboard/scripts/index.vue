<template lang="pug">
a-layout.layout
  a-layout-sider(:resize-directions="['right']" :width="321")
    ListTabs(:has="['Tables', 'Scripts']")
  a-layout-content
    a-space.content-space(direction="vertical" fill size="large")
      PyEditor
      DataView(v-if="!!results?.length" :results="results" :types="types")
      Logs(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Scripts" setup>
  const { getResultsByType } = useQueryCode()
  const { logs } = storeToRefs(useLogStore())
  const { codeType, guideModalVisible } = storeToRefs(useAppStore())
  const { dataStatusMap } = storeToRefs(useUserStore())

  const { checkTables, getScriptsTable } = useDataBaseStore()

  const types = ['python']

  const results = computed(() => getResultsByType(types))

  const queryLogs = computed(() => logs.value.filter((log) => types.includes(log.type)))
  // TODO: add more code type in the future if needed

  onActivated(() => {
    codeType.value = 'python'
    if (!guideModalVisible.value) {
      if (!dataStatusMap.value.scripts) {
        getScriptsTable()
      }
      if (!dataStatusMap.value.tables) {
        checkTables()
      }
    }
  })
</script>
