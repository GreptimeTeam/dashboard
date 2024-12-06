<template lang="pug">
.container
  div(style="padding: 0; background-color: var(--color-neutral-2); margin: 0")
    Toolbar
    SQLBuilder(
      v-if="editorType === 'builder'"
      style="padding: 10px 20px; border: 1px solid var(--color-neutral-3); border-top: none; background-color: var(--color-bg-2)"
    )
    InputEditor(v-else)
  CountChart.block(
    v-if="showChart"
    style="margin: 5px 0 0; padding: 10px 0; background-color: var(--color-bg-2); border: 1px solid var(--color-neutral-3); flex-shrink: 0"
  )
  div(
    style="padding: 3px 15px; height: 40px; white-space: nowrap; color: var(--color-text-2); display: flex; justify-content: space-between; border: 1px solid var(--color-neutral-3); background-color: var(--color-bg-2); margin: 5px 0"
  )
    a-space
      | {{ $t('logquery.results') }}: {{ rows.length }}
      span(:title="showChart ? $t('logquery.hideStatChart') : $t('logquery.showStatChart')")
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
        span(style="color: var(--color-text-2)") {{ $t('logquery.wrapLines') }}

    a-space
      a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
        a-button(type="text" style="color: var(--color-text-2)")
          | {{ $t('logquery.columns') }}
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
  import useLogQueryStore from '@/store/modules/logquery'
  import InputEditor from './InputEditor.vue'
  import LogTableData from './TableData.vue'
  import CountChart from './CountChart.vue'
  import SQLBuilder from './SQLBuilder.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'

  const { fetchDatabases } = useAppStore()
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()

  const { getSchemas, getRelativeRange } = useLogQueryStore()
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
  } = storeToRefs(useLogQueryStore())
  const showChart = useStorage('logquery-chart-visible', true)
  const compact = useStorage('logquery-table-compact', false)
  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)
  getSchemas()
  const pageKey = computed(() => {
    return `${queryNum.value}_${tableIndex.value}`
  })

  onActivated(async () => {
    await Promise.all([
      (async () => {
        if (!dataStatusMap.value.tables) {
          await fetchDatabases()
          await checkTables()
        }
      })(),
    ])
  })
  const appStore = useAppStore()
  watch(
    () => appStore.database,
    () => {
      // reload after local storage write complete
      setTimeout(() => window.location.reload(), 100)
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
