<template lang="pug">
.container(:key="containerKey")
  div(style="padding: 0; background-color: var(--color-neutral-2); margin: 0")
    Toolbar
    SQLBuilder(
      v-if="editorType === 'builder'"
      ref="sqlBuilderRef"
      v-model:form-state="currentBuilderFormState"
      style="padding: 10px 20px; border: 1px solid var(--color-neutral-3); border-top: none; background-color: var(--color-bg-2)"
      :time-range-values="timeRangeValues"
      @update:sql="handleBuilderSqlUpdate"
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
  LogTableData(
    style="flex: 1 1 auto; overflow: auto"
    :wrap-line="wrap"
    :size="size"
    :data="rows"
    :columns="columns"
    :sql-mode="editorType"
    :ts-column="tsColumn"
    :column-mode="mergeColumn && showKeys ? 'merged-with-keys' : mergeColumn ? 'merged' : 'separate'"
    :displayed-columns="displayedColumns[inputTableName] || []"
    @filter-condition-add="handleFilterConditionAdd"
    @row-select="handleRowSelect"
  )
</template>

<script ts setup name="QueryIndex">
  import { useStorage } from '@vueuse/core'
  import { nextTick } from 'vue'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import InputEditor from './InputEditor.vue'
  import LogTableData from './TableData.vue'
  import ChartContainer from './ChartContainer.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'

  const { fetchDatabases } = useAppStore()
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()

  const logsStore = useLogsQueryStore()
  const { getSchemas, getRelativeRange, reset, query } = logsStore
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
    sql,
    editingSql,
    time,
    rangeTime,
    editingTsColumn,
  } = storeToRefs(logsStore)

  // SQLBuilder integration
  const sqlBuilderRef = ref()
  const currentBuilderFormState = ref(null)

  // Time limit for SQLBuilder
  const hasTimeLimit = computed(() => time.value > 0 || rangeTime.value.length > 0)

  // Pre-processed time range values for logs system
  const timeRangeValues = computed(() => {
    if (!hasTimeLimit.value || !tsColumn.value) return []

    const { multiple } = tsColumn.value
    const [start, end] = getRelativeRange(multiple)
    if (start && end) {
      return [start, end]
    }
    return []
  })

  // Handle SQLBuilder updates
  function handleBuilderSqlUpdate(generatedSql) {
    editingSql.value = generatedSql
    sql.value = generatedSql
  }

  // Handle filter condition from table context menu
  function handleFilterConditionAdd(columnName, operator, value) {
    if (!currentBuilderFormState.value) return

    // Add new condition to the form state
    const newCondition = {
      field: columnName,
      operator,
      value: String(value),
      relation: 'AND',
      isTimeColumn: false,
    }

    currentBuilderFormState.value.conditions.push(newCondition)
  }

  // Handle row selection from table
  function handleRowSelect(row) {
    // Update the store's selected row if needed
    logsStore.currRow = row
  }

  // Watch for form state changes to update store and handle table changes
  watch(
    currentBuilderFormState,
    (formState) => {
      // Update the editing table name in the store
      if (formState?.table) {
        logsStore.editingTableName = formState.table
        // logsStore.inputTableName = formState.table

        // Update the timestamp column when table changes
        nextTick(() => {
          tsColumn.value = editingTsColumn.value
        })
      }
    },
    { deep: true }
  )
  const showChart = useStorage('logquery-chart-visible', true)
  const compact = useStorage('logquery-table-compact', false)

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
  watch(queryNum, () => {
    query()
  })
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
