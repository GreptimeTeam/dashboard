<template lang="pug">
.container(:key="containerKey")
  div(style="padding: 0; background-color: var(--color-neutral-2); margin: 0")
    Toolbar
    SQLBuilder(
      v-if="editorType === 'builder'"
      style="padding: 10px 20px; border: 1px solid var(--color-neutral-3); border-top: none; background-color: var(--color-bg-2)"
    )
    InputEditor(v-else)
  ChartContainer.block(
    v-if="showChart"
    style="margin: 5px 0 0; padding: 10px 0; background-color: var(--color-bg-2); border: 1px solid var(--color-neutral-3); flex-shrink: 0"
  )
  div(
    style="padding: 3px 15px; height: 40px; white-space: nowrap; color: var(--color-text-2); display: flex; justify-content: space-between; border: 1px solid var(--color-neutral-3); background-color: var(--color-bg-2); margin: 5px 0"
  )
    a-space
      | {{ $t('logsQuery.results') }}: {{ rows.length }}
      span(:title="showChart ? $t('logsQuery.hideStatChart') : $t('logsQuery.showStatChart')")
        icon-bar-chart(
          style="cursor: pointer"
          size="small"
          :class="{ active: showChart }"
          @click="() => (showChart = !showChart)"
        ) 
      a-checkbox(v-model="mergeColumn" type="button" size="small")
        | Single Column
      a-checkbox(
        v-if="mergeColumn"
        v-model="showKeys"
        type="button"
        size="small"
      )
        | Show Keys
      a-checkbox(v-model="compact" type="button" size="small")
        | Compact Mode
      a-checkbox(v-model="wrap" size="small")
        span {{ $t('logsQuery.wrapLines') }}

    a-space
      a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
        a-button(type="text" style="color: var(--color-text-2)")
          | {{ $t('logsQuery.columns') }}
        template(#content)
          a-card(style="padding: 10px")
            a-checkbox-group(v-model="displayedColumns[inputTableName]" direction="vertical")
              a-checkbox(v-for="column in columns" :value="column.name")
                | {{ column.name }}
      Pagination(v-if="!refresh && tsColumn" :key="pageKey")
  LogTableData(style="flex: 1 1 auto; overflow: auto" :wrap-line="wrap" :size="size")
</template>

<script ts setup name="QueryIndex">
  import { useStorage } from '@vueuse/core'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import InputEditor from './InputEditor.vue'
  import LogTableData from './TableData.vue'
  import ChartContainer from './ChartContainer.vue'
  import SQLBuilder from './SQLBuilder.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'

  const { fetchDatabases } = useAppStore()
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()

  const { getSchemas, getRelativeRange, reset } = useLogsQueryStore()
  const {
    rows,
    editorType,
    queryNum,
    displayedColumns,
    columns,
    inputTableName,
    refresh,
    tableIndex,
    mergeColumn,
    showKeys,
    tsColumn,
  } = storeToRefs(useLogsQueryStore())
  const showChart = useStorage('logsQuery-chart-visible', true)
  const compact = useStorage('logsQuery-table-compact', false)
  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)
  getSchemas()
  const pageKey = computed(() => {
    return `${queryNum.value}_${tableIndex.value}`
  })

  Promise.all([
    (async () => {
      if (!dataStatusMap.value.tables) {
        await fetchDatabases()
        await checkTables()
      }
    })(),
  ])

  const appStore = useAppStore()
  const containerKey = ref('')
  watch(
    () => appStore.database,
    () => {
      containerKey.value = String(Date.now())
      reset()
      getSchemas()
      // setTimeout(() => window.location.reload(), 1500)
    }
  )
</script>

<style lang="less">
  .container {
    padding: 5px 5px 0 5px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .active {
    color: var(--color-primary);
  }
</style>
