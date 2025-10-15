<template lang="pug">
.query-layout.logs-query-container.query-container
  .page-header
    | {{ $t('menu.dashboard.logsQuery') }}
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      .toolbar
        a-radio-group(type="button" :model-value="editorType" @update:modelValue="(val) => (editorType = val)")
          a-radio(value="builder") {{ $t('logsQuery.builder') }}
          a-radio(value="text") {{ $t('logsQuery.code') }}
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
          | {{ $t('dashboard.run') }}
        a-checkbox(size="small" :model-value="refresh" @update:modelValue="(val) => (refresh = val)")
          span(style="color: var(--color-text-2)") {{ $t('logsQuery.live') }}
        a-space(style="margin-left: auto")
          a-button(
            type="outline"
            size="small"
            :disabled="!queryState.table || queryLoading"
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
          storage-key="logs-query-table"
          :form-state="builderFormState"
          :default-form-state="defaultFormState"
        )
        SqlTextEditor(
          v-if="editorType === 'text'"
          v-model="textEditor.textEditorState.sql"
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
              | ({{ rows.length }} {{ rows.length === 1 ? $t('logsQuery.record') : $t('logsQuery.records') }}
              | )
          a-checkbox(v-model="mergeColumn" type="button" size="small")
            | {{ $t('logsQuery.singleColumn') }}
          a-checkbox(
            v-if="mergeColumn"
            v-model="showKeys"
            type="button"
            size="small"
          )
            | {{ $t('logsQuery.showKeys') }}
          a-checkbox(v-model="compact" type="button" size="small")
            | {{ $t('logsQuery.compactMode') }}
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
      )
</template>

<script setup lang="ts">
  import { ref, computed, shallowRef, watch, onMounted, toRefs, nextTick } from 'vue'
  import { useStorage, useLocalStorage } from '@vueuse/core'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import LogTableData from './LogsTable.vue'
  import ChartContainer from './ChartContainer.vue'
  import Pagination from './Pagination.vue'

  const timeRange = useTimeRange()
  const { rangeTime, time, timeRangeValues } = timeRange

  const builder = useSqlBuilderHook({ storageKey: 'logsquery-table', timeRangeValues })
  const { builderFormState, addFilterCondition, generateSql, defaultFormState } = builder

  const textEditor = useTextEditorState()

  const {
    editorType,
    executeQuery,
    exportToCSV,
    queryState,
    loading: queryLoading,
    columns,
    rows,
    canExecuteInitialQuery,
  } = useQueryExecution(builder, textEditor, timeRange)
  // 5. URL sync
  const urlSync = useQueryUrlSync({
    builderFormState,
    textEditorState: textEditor.textEditorState,
    timeRange,
    editorType,
  })

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
  function handleQuery(newQuery: boolean | MouseEvent = true) {
    // If called from click event, newQuery will be a MouseEvent, so default to true
    const isNewQuery = typeof newQuery === 'boolean' ? newQuery : true

    executeQuery(isNewQuery).then(() => {
      if (isNewQuery) {
        updateQueryParams()
        refreshPagination()
      }
    })

    nextTick(() => {
      chartContainerRef.value?.triggerCurrentChartQuery()
    })
  }
  function exportSql() {
    exportToCSV()
  }

  // Live query logic
  let refreshTimeout: number | undefined = -1
  function mayRefresh() {
    if (refresh.value) {
      handleQuery(false)
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
    executeQuery().then(() => {
      refreshPagination()
    })
    nextTick(() => {
      chartContainerRef.value?.triggerCurrentChartQuery()
    })
  }

  function handleFilterConditionAdd({ columnName, operator, value }) {
    addFilterCondition(columnName, operator, value)
  }

  function handlePaginationRowsUpdate(newRows) {
    rows.value = newRows
  }

  function handleSqlInfoUpdate(sqlInfo) {
    Object.assign(textEditor.textEditorState, sqlInfo)
  }

  watch(columns, () => {
    if (!columns.value.length) {
      return
    }
    if (!displayedColumns.value[queryState.table] || !displayedColumns.value[queryState.table].length) {
      displayedColumns.value[queryState.table] = columns.value.map((c) => c.name)
    }
  })

  // Initialize from URL query parameters
  onMounted(() => {
    initializeFromQuery()
  })

  watch(
    canExecuteInitialQuery,
    (canExecute) => {
      if (canExecute && urlSync.hasInitParams.value) {
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
  .toolbar {
    flex-shrink: 0;
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 50px;
    gap: 10px;
  }
</style>
