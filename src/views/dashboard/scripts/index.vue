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
  import { useDatabases } from '@/hooks/databases'

  const { getResultsByType } = useQueryCode()
  const { logs } = storeToRefs(useLogStore())

  const { guideModalVisible } = storeToRefs(useAppStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables, getScriptsTable } = useDataBaseStore()
  const { databases, databasesLoading, subscribe, cleanup } = useDatabases()

  const types = ['python']

  const results = computed(() => getResultsByType(types))

  const queryLogs = computed(() => logs.value.filter((log) => types.includes(log.type)))
  // TODO: add more code type in the future if needed

  onActivated(async () => {
    subscribe()

    if (!dataStatusMap.value.scripts) {
      getScriptsTable()
    }

    // 等待数据库加载完成后再检查表格
    const checkTablesWhenReady = async () => {
      if (!dataStatusMap.value.tables && databases.value.length > 0) {
        await checkTables()
      }
    }

    if (!databasesLoading.value && databases.value.length > 0) {
      await checkTablesWhenReady()
    } else {
      watch(
        [databasesLoading, databases],
        async ([loading, dbs]) => {
          if (!loading && dbs.length > 0) {
            await checkTablesWhenReady()
          }
        },
        { immediate: true }
      )
    }
  })

  onDeactivated(() => {
    cleanup()
  })
</script>
