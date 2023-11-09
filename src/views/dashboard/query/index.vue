<template lang="pug">
a-layout.layout
  a-layout-sider(style="width: 66.6%; min-width: 500px" :resize-directions="['right']")
    TableManager
  a-layout-content
    LogsLayout(:logs="queryLogs" :types="types")
</template>

<script lang="ts" name="Query" setup>
  const { guideModalVisible } = storeToRefs(useAppStore())
  const { getTables } = useDataBaseStore()
  const { dataStatusMap } = storeToRefs(useUserStore())

  const { logs } = storeToRefs(useLogStore())
  const { getResultsByType } = useQueryCode()

  const types = ['sql', 'promql']

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
