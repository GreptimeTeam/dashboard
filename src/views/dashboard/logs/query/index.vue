<template lang="pug">
.query-layout.logs-query-container.query-container(:key="containerKey")
  .page-header
    | Logs
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      Toolbar(
        :query-loading="queryLoading"
        :columns="columns"
        :ts-column="tsColumn"
        @time-range-values-update="handleTimeRangeValuesUpdate"
        @query="handleToolbarQuery"
      )
      .sql-container
        SQLBuilder(
          v-if="editorType === 'builder'"
          ref="sqlBuilderRef"
          v-model:form-state="builderFormState"
          :time-range-values="builderTimeRangeValues"
          @update:sql="handleBuilderSqlUpdate"
        )
        InputEditor(v-else :schema="schemaForEditor" :ts-column="tsColumn")

    ChartContainer(
      :columns="columns"
      :rows="rows"
      :ts-column="tsColumn"
      :refresh-trigger="chartRefreshTrigger"
      @update:rows="handleChartRowsUpdate"
      @query="handleChartQuery"
    )

    a-card(:bordered="false")
      template(#title)
        a-space
          span.results-header
            span {{ $t('logsQuery.results') }}
            span.results-count
              | ({{ rows.length }} {{ rows.length > 1 ? 'records' : 'record' }})
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

      template(#extra)
        a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
          a-button(type="text" style="color: var(--color-text-2)")
            | {{ $t('logsQuery.columns') }}
          template(#content)
            a-card(style="padding: 10px")
              a-checkbox-group(v-model="displayedColumns[currentTableName]" direction="vertical")
                a-checkbox(v-for="column in columns" :value="column.name")
                  | {{ column.name }}
        Pagination(
          v-if="!refresh && tsColumn"
          :key="paginationKey"
          :rows="rows"
          :columns="columns"
          :sql="finalQuery"
          :ts-column="tsColumn"
          :limit="logsStore.limit"
          @update:rows="handlePaginationRowsUpdate"
        )
      LogTableData(
        :wrap-line="wrap"
        :size="size"
        :data="rows"
        :columns="columns"
        :sql-mode="editorType"
        :ts-column="tsColumn"
        :column-mode="mergeColumn && showKeys ? 'merged-with-keys' : mergeColumn ? 'merged' : 'separate'"
        :displayed-columns="displayedColumns[currentTableName] || []"
        @filter-condition-add="handleFilterConditionAdd"
        @row-select="handleRowSelect"
      )
</template>

<script ts setup name="QueryIndex">
  import { useStorage, watchOnce, useLocalStorage } from '@vueuse/core'
  import { nextTick, ref, computed, shallowRef, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { IconDown, IconRight } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import useAppStore from '@/store/modules/app'
  import useUserStore from '@/store/modules/user'
  import useDataBaseStore from '@/store/modules/database'

  import SQLBuilder from '@/components/sql-builder/index.vue'
  import InputEditor from './InputEditor.vue'
  import LogTableData from './LogsTable.vue'
  import ChartContainer from './ChartContainer.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'
  import { toObj, parseTable, parseLimit, processSQL } from './until'

  const { fetchDatabases } = useAppStore()
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()

  const logsStore = useLogsQueryStore()
  const {
    reset,
    initializeFromQuery,
    updateQueryParams,
    executeQuery: baseExecuteQuery,
    addFilterCondition,
  } = logsStore
  const {
    editorType,
    currentTableName,
    time,
    rangeTime,
    timeRangeValues,
    refresh,
    builderFormState,
    editorSql,
    finalQuery,
    loading: queryLoading,
    columns,
    builderSql,
  } = storeToRefs(logsStore)

  // Local state for query data (moved from store)
  const rows = shallowRef([])
  const queryColumns = shallowRef([])

  // Local UI state (moved from store)
  const mergeColumn = useStorage('logquery-merge-column', true)
  const showKeys = useStorage('logquery-show-keys', true)
  const displayedColumns = useStorage('logquery-table-column-visible', {})

  // Chart refresh trigger - explicit method
  const chartRefreshTrigger = ref(0)
  const triggerChartRefresh = () => {
    chartRefreshTrigger.value += 1
  }

  // Key for forcing pagination re-render when needed
  const paginationKey = ref(0)
  const refreshPagination = () => {
    paginationKey.value += 1
  }

  // Computed timestamp column from available columns
  const tsColumn = computed(() => {
    if (!columns.value.length) return null

    // Find timestamp columns by data type
    const tsColumns = columns.value.filter((col) => col.data_type.toLowerCase().includes('timestamp'))

    // Prefer columns with TIMESTAMP semantic type
    const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
    const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]

    if (!selectedColumn) return null

    // Return the column with data_type - DataTable will calculate the multiple automatically
    return {
      name: selectedColumn.name,
      data_type: selectedColumn.data_type,
    }
  })

  // SQLBuilder integration

  // Handler for TimeRangeSelect updates
  function handleTimeRangeValuesUpdate(newTimeRangeValues) {
    timeRangeValues.value = newTimeRangeValues
  }

  // Use timeRangeValues for SQLBuilder (processed time values)
  const builderTimeRangeValues = computed(() => timeRangeValues.value)

  // Handle SQLBuilder updates
  function handleBuilderSqlUpdate(generatedSql) {
    // Stop live query when user makes changes
    if (refresh.value) {
      refresh.value = false
    }

    builderSql.value = generatedSql
  }

  // Note: editorSql generation when switching to text mode is now handled by the base store

  // Note: finalQuery computation with placeholder replacement is now handled by the base store

  // Note: finalQuery is now the single source of truth for the processed SQL query

  // Schema format for SQL editor - group columns by table name
  const schemaForEditor = computed(() => {
    if (!currentTableName.value || !columns.value.length) return {}

    return {
      [currentTableName.value]: columns.value.map((col) => col.name),
    }
  })

  // Logs-specific result transformation function
  const transformLogsResults = (rawRows, columnsData) => {
    if (rawRows.length === 0 || columnsData.length === 0) return rawRows

    return rawRows.map((row, index) => {
      return toObj(row, columnsData, index, tsColumn.value)
    })
  }

  // Enhanced executeQuery that uses base store and handles logs-specific UI logic
  const executeQuery = async () => {
    // Prevent concurrent executions
    if (queryLoading.value) {
      return
    }

    try {
      // Execute query using base store's unified logic with transformation
      const transformedRows = await baseExecuteQuery()

      // Set the returned rows
      rows.value = transformedRows || []

      // UI-specific actions after successful query
      triggerChartRefresh()
      refreshPagination()
    } catch (error) {
      console.error('Query execution failed:', error)
    }
  }

  // Handle filter condition from table context menu
  function handleFilterConditionAdd({ columnName, operator, value }) {
    addFilterCondition(columnName, operator, value)
  }

  // Handle row selection from table
  function handleRowSelect(row) {
    // Store selected row locally if needed for other components
    // Could emit to parent or handle locally as needed
  }

  // Handle pagination rows update
  function handlePaginationRowsUpdate(newRows) {
    rows.value = newRows
  }

  // Handle chart rows update
  function handleChartRowsUpdate(newRows) {
    rows.value = newRows
  }

  // Handle chart query request
  function handleChartQuery() {
    executeQuery()
  }

  // Handle manual query execution from toolbar
  function handleToolbarQuery() {
    if (!currentTableName.value) {
      return
    }

    // Stop live query when user manually triggers a query
    if (refresh.value) {
      refresh.value = false
    }

    if (editorType.value === 'text') {
      logsStore.limit = parseLimit(editorSql.value)
      // Process SQL with placeholders
      editorSql.value = processSQL(editorSql.value, tsColumn.value?.name, logsStore.limit)
    }

    // Note: editorSql changes are automatically reflected in finalQuery

    // Execute the query
    executeQuery()
  }

  // Watch for form state changes to stop live query when table changes
  watch(
    builderFormState,
    (formState, oldFormState) => {
      // Stop live query when table changes
      if (formState?.table && oldFormState?.table && refresh.value && formState.table !== oldFormState.table) {
        refresh.value = false
      }
    },
    { deep: true }
  )

  // Stop live query when time range changes
  watch(
    [time, rangeTime],
    () => {
      if (refresh.value) {
        refresh.value = false
      }
    },
    { deep: true }
  )

  // Stop live query when SQL is manually edited in text mode
  watch(editorSql, (newSql, oldSql) => {
    if (newSql !== oldSql && refresh.value && editorType.value === 'text') {
      refresh.value = false
    }
  })

  // Watch columns changes to update displayed columns
  watch(columns, () => {
    if (!displayedColumns.value[currentTableName.value]) {
      displayedColumns.value[currentTableName.value] = columns.value.map((c) => c.name)
    }
  })

  const compact = useStorage('logquery-table-compact', false)
  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)

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
      // Reset local state when database changes
      rows.value = []
      queryColumns.value = []
    }
  )

  // Automatic query execution when URL contains sufficient data
  watchOnce(finalQuery, () => {
    if (finalQuery.value && currentTableName.value) {
      nextTick(() => {
        executeQuery()
      })
    }
  })

  // Initialize from URL query parameters
  initializeFromQuery()
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';
</style>
