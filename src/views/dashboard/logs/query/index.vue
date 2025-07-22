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
        @query="handleToolbarQuery"
      )
      .sql-container
        SQLBuilder(
          v-if="editorType === 'builder'"
          ref="sqlBuilderRef"
          v-model:form-state="builderFormState"
          storage-key="logs-query-table"
          @update:sql="handleBuilderSqlUpdate"
        )
        SqlTextEditor(v-if="editorType === 'text'" v-model="editorSql" @update:sql-info="handleSqlInfoUpdate")

    ChartContainer(
      ref="chartContainerRef"
      :columns="columns"
      :rows="rows"
      :ts-column="queryState.tsColumn"
      @timeRangeUpdate="handleTimeRangeUpdate"
    )

    a-card(:bordered="false")
      template(#title)
        a-space
          span.results-header
            span {{ $t('logsQuery.results') }}
            span.results-count(v-if="rows.length > 0") 
              | ({{ rows.length }} {{ rows.length === 1 ? 'record' : 'records' }}
              | )
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
        a-space
          a-trigger(
            v-if="columns && columns.length"
            trigger="click"
            size="small"
            :unmount-on-close="false"
          )
            a-button(type="text" style="color: var(--color-text-2)")
              | {{ $t('logsQuery.columns') }}
            template(#content)
              a-card(style="padding: 10px")
                a-checkbox-group(v-model="displayedColumns[queryState.tableName]" direction="vertical")
                  a-checkbox(v-for="column in columns" :value="column.name")
                    | {{ column.name }}
          Pagination(
            v-if="!refresh && editorType === 'builder' && builderFormState"
            :key="paginationKey"
            :rows="rows"
            :columns="columns"
            :sql="builderSql"
            :ts-column="tsColumn"
            :limit="logsStore.limit"
            @update:rows="handlePaginationRowsUpdate"
          )
      LogTableData(
        :key="queryState.tableName"
        :wrap-line="wrap"
        :size="size"
        :data="rows"
        :columns="columns"
        :sql-mode="queryState.editorType"
        :ts-column="queryState.tsColumn"
        :column-mode="mergeColumn && showKeys ? 'merged-with-keys' : mergeColumn ? 'merged' : 'separate'"
        :displayed-columns="displayedColumns[queryState.tableName] || []"
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
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import LogTableData from './LogsTable.vue'
  import ChartContainer from './ChartContainer.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'
  import { toObj, parseTable, parseLimit, processSQL } from './until'

  const { dataStatusMap } = storeToRefs(useUserStore())

  const logsStore = useLogsQueryStore()
  const { reset, initializeFromQuery, executeQuery: baseExecuteQuery, addFilterCondition } = logsStore
  const {
    editorType,
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
    tsColumn,
    editorTsColumn,
    editorTableName,
  } = storeToRefs(logsStore)
  const { queryState } = useLogsQueryStore()

  // Local state for query data (moved from store)
  const rows = shallowRef([])
  const queryColumns = shallowRef([])

  // Local UI state (moved from store)
  const mergeColumn = useStorage('logquery-merge-column', true)
  const showKeys = useStorage('logquery-show-keys', true)
  const displayedColumns = useStorage('logquery-table-column-visible', {})

  // Chart container ref for triggering count queries
  const chartContainerRef = ref()

  // Key for forcing pagination re-render when needed
  const paginationKey = ref(0)
  const refreshPagination = () => {
    paginationKey.value += 1
  }

  // Check if all required values are available for initial query
  const canExecuteInitialQuery = computed(() => {
    if (editorType.value === 'builder') {
      return finalQuery.value && tsColumn.value && builderFormState.value?.table
    }
    return editorTsColumn.value && editorTableName.value
  })

  // Track if we've already executed the initial query
  const hasExecutedInitialQuery = ref(false)

  // Handle SQLBuilder updates
  function handleBuilderSqlUpdate(generatedSql) {
    // Stop live query when user makes changes
    if (refresh.value) {
      refresh.value = false
    }

    // Note: builderSql is now computed from builderFormState, so this method is for compatibility
    // The actual SQL generation happens in the base store
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
      chartContainerRef.value?.triggerCurrentChartQuery()
      refreshPagination()
    } catch (error) {
      console.error('Query execution failed:', error)
    }
  }

  function handleTimeRangeUpdate(newTimeRange) {
    time.value = 0 // Switch to custom mode
    rangeTime.value = newTimeRange
    executeQuery() // Re-run query with new time range
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

  // Handle manual query execution from toolbar
  function handleToolbarQuery() {
    if (editorType.value === 'text') {
      logsStore.limit = parseLimit(editorSql.value)
      // Process SQL with placeholders
      editorSql.value = processSQL(editorSql.value, tsColumn.value?.name, logsStore.limit)
    }

    // Note: editorSql changes are automatically reflected in finalQuery

    // Execute the query
    executeQuery()
  }

  // Handle SQL info updates from SqlTextEditor
  function handleSqlInfoUpdate(sqlInfo) {
    editorTableName.value = sqlInfo.tableName
    editorTsColumn.value = sqlInfo.tsColumn
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
    if (!displayedColumns.value[queryState.tableName]) {
      displayedColumns.value[queryState.tableName] = columns.value.map((c) => c.name)
    }
  })

  const compact = useStorage('logquery-table-compact', false)
  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)

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

  // Initialize from URL query parameters
  initializeFromQuery()

  // Watch for when all async values are available
  watch(
    canExecuteInitialQuery,
    (canExecute) => {
      if (canExecute && !hasExecutedInitialQuery.value) {
        hasExecutedInitialQuery.value = true
        executeQuery()
      }
    },
    {
      immediate: true,
    }
  )
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';
  .results-count {
    color: var(--color-text-3);
    font-size: 12px;
    font-weight: normal;
  }
</style>
