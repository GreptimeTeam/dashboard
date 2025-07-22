<template lang="pug">
.query-layout.logs-query-container.query-container
  .page-header
    | Logs
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      .toolbar
        a-radio-group(type="button" :model-value="editorType" @update:modelValue="(val) => (editorType = val)")
          a-radio(value="builder") Builder
          a-radio(value="text") Text
        TimeRangeSelect(
          button-type="outline"
          :time-length="time"
          :time-range="rangeTime"
          @update:time-length="(val) => (time = val)"
          @update:time-range="(val) => (rangeTime = val)"
        )
        a-button(
          type="primary"
          size="small"
          :loading="queryLoading"
          @click="handleQuery"
        )
          template(#icon)
            icon-loading(v-if="queryLoading" spin)
            icon-play-arrow(v-else)
          | {{ $t('dashboard.runQuery') }}
        a-checkbox(size="small" :model-value="refresh" @update:modelValue="(val) => (refresh = val)")
          span(style="color: var(--color-text-2)") {{ $t('logsQuery.live') }}
        a-space(style="margin-left: auto")
          a-button(
            type="outline"
            size="small"
            :disabled="!executableSql || queryLoading"
            @click="exportSql"
          )
            template(#icon)
              svg.icon
                use(href="#export")
            | {{ $t('dashboard.exportCSV') }}
      .sql-container
        SQLBuilder(
          v-if="editorType === 'builder'"
          ref="sqlBuilderRef"
          v-model:form-state="builderFormState"
          storage-key="logs-query-table"
        )
        SqlTextEditor(
          v-if="editorType === 'text'"
          v-model="textEditorState.sql"
          @update:sql-info="handleSqlInfoUpdate"
        )

    ChartContainer(
      ref="chartContainerRef"
      :columns="columns"
      :rows="rows"
      :query-state="queryState"
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
                a-checkbox-group(v-model="displayedColumns[queryState.table]" direction="vertical")
                  a-checkbox(v-for="column in columns" :value="column.name")
                    | {{ column.name }}
          Pagination(
            v-if="!refresh && editorType === 'builder' && builderFormState.tsColumn"
            :key="paginationKey"
            :rows="rows"
            :columns="columns"
            :query-state="queryState"
            @update:rows="handlePaginationRowsUpdate"
          )
      LogTableData(
        :key="queryState.table"
        :wrap-line="wrap"
        :size="size"
        :data="rows"
        :columns="columns"
        :sql-mode="queryState.editorType"
        :ts-column="queryState.tsColumn"
        :column-mode="mergeColumn && showKeys ? 'merged-with-keys' : mergeColumn ? 'merged' : 'separate'"
        :displayed-columns="displayedColumns[queryState.table] || []"
        @filter-condition-add="handleFilterConditionAdd"
        @row-select="handleRowSelect"
      )
</template>

<script setup lang="ts">
  import { ref, computed, shallowRef, watch, onMounted, toRefs } from 'vue'
  import { useStorage, useLocalStorage } from '@vueuse/core'
  import { useSqlBuilderHook, useTimeRange, useQueryExecution, useQueryUrlSync } from '@/hooks'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import LogTableData from './LogsTable.vue'
  import ChartContainer from './ChartContainer.vue'
  import Pagination from './Pagination.vue'

  // 3. Time range state

  const timeRange = useTimeRange()
  const { rangeTime, time, timeRangeValues } = toRefs(timeRange)
  // 1. Builder form state
  const builder = useSqlBuilderHook({ storageKey: 'logs-query-table', timeRangeValues })
  const { builderFormState, builderSql, addFilterCondition, generateSql } = builder

  const textEditorState = ref({
    table: '',
    orderBy: 'DESC',
    limit: 1000,
    tsColumn: null,
    sql: '',
  })

  // 4. Query execution state
  const {
    editorType,
    executableSql,
    executeQuery,
    exportToCSV,
    queryState,
    loading: queryLoading,
    columns,
    rows,
    canExecuteInitialQuery,
  } = useQueryExecution(builder, textEditorState, timeRange)

  // 5. URL sync
  const urlSync = useQueryUrlSync({ builder, textEditorState, timeRange, editorType })
  const { initializeFromQuery, updateQueryParams } = urlSync

  // Local UI state
  const mergeColumn = useStorage('logquery-merge-column', true)
  const showKeys = useStorage('logquery-show-keys', true)
  const displayedColumns = useStorage('logquery-table-column-visible', {})

  const chartContainerRef = ref()
  const paginationKey = ref(0)
  const refreshPagination = () => {
    paginationKey.value += 1
  }
  const refresh = ref(false)
  const hasExecutedInitialQuery = ref(false)
  function handleQuery() {
    executeQuery()

    updateQueryParams()
    nextTick(() => {
      chartContainerRef.value.triggerCurrentChartQuery()
    })
  }
  function exportSql() {
    exportToCSV()
  }

  // Live query logic
  let refreshTimeout = -1
  function mayRefresh() {
    if (refresh.value && executableSql.value) {
      handleQuery()
      refreshTimeout = window.setTimeout(() => {
        mayRefresh()
      }, 3000)
    } else {
      clearTimeout(refreshTimeout)
    }
  }

  watch(refresh, (newValue) => {
    if (newValue) {
      mayRefresh()
    } else {
      clearTimeout(refreshTimeout)
    }
  })

  const compact = useStorage('logquery-table-compact', false)
  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)

  // Chart/row logic
  function handleTimeRangeUpdate(newTimeRange) {
    time.value = 0 // Switch to custom mode
    rangeTime.value = newTimeRange
    executeQuery()
  }

  function handleFilterConditionAdd({ columnName, operator, value }) {
    addFilterCondition(columnName, operator, value)
  }

  function handleRowSelect(row) {
    // Implement as needed
  }

  function handlePaginationRowsUpdate(newRows) {
    rows.value = newRows
  }

  function handleSqlInfoUpdate(sqlInfo) {
    textEditorState.value = { ...textEditorState.value, ...sqlInfo }
  }

  watch(columns, () => {
    if (!displayedColumns.value[queryState.table]) {
      displayedColumns.value[queryState.table] = columns.value.map((c) => c.name)
    }
  })

  watch(queryState, () => {
    console.log(queryState, 'queryState')
  })

  // Initialize from URL query parameters
  onMounted(() => {
    initializeFromQuery()
  })

  watch(
    canExecuteInitialQuery,
    (canExecute) => {
      if (canExecute && !hasExecutedInitialQuery.value) {
        hasExecutedInitialQuery.value = true
        nextTick(() => {
          handleQuery()
        })
      }
    },
    { immediate: true }
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
