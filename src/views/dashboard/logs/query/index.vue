<template lang="pug">
.container(:key="containerKey")
  div(style="padding: 0; background-color: var(--color-neutral-2); margin: 0")
    Toolbar(
      :query-loading="queryLoading"
      :columns="columns"
      :ts-column="tsColumn"
      @time-range-values-update="handleTimeRangeValuesUpdate"
    )
    SQLBuilder(
      v-if="editorType === 'builder'"
      ref="sqlBuilderRef"
      v-model:form-state="currentBuilderFormState"
      style="padding: 10px 20px; border: 1px solid var(--color-neutral-3); border-top: none; background-color: var(--color-bg-2)"
      :time-range-values="builderTimeRangeValues"
      @update:sql="handleBuilderSqlUpdate"
    )
    InputEditor(v-else :schema="schemaForEditor" :ts-column="tsColumn")
  ChartContainer.block(
    v-if="showChart"
    style="margin: 5px 0 0; padding: 10px 0; background-color: var(--color-bg-2); border: 1px solid var(--color-neutral-3); flex-shrink: 0"
    :columns="columns"
    :rows="rows"
    :ts-column="tsColumn"
    @update:rows="handleChartRowsUpdate"
    @query="handleChartQuery"
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
            a-checkbox-group(v-model="displayedColumns[currentTableName]" direction="vertical")
              a-checkbox(v-for="column in columns" :value="column.name")
                | {{ column.name }}
      Pagination(
        v-if="!refresh && tsColumn"
        :key="pageKey"
        :rows="rows"
        :columns="columns"
        :sql="sql"
        :ts-column="tsColumn"
        :limit="logsStore.limit"
        @update:rows="handlePaginationRowsUpdate"
      )
  LogTableData(
    style="flex: 1 1 auto; overflow: auto"
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
  import { useStorage } from '@vueuse/core'
  import { nextTick, ref, computed, shallowRef, watch } from 'vue'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import InputEditor from './InputEditor.vue'
  import LogTableData from './TableData.vue'
  import ChartContainer from './ChartContainer.vue'
  import Toolbar from './Toolbar.vue'
  import Pagination from './Pagination.vue'
  import { toObj } from './until'

  const { fetchDatabases } = useAppStore()
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()

  const logsStore = useLogsQueryStore()
  const { reset } = logsStore
  const {
    editorType,
    queryNum,
    displayedColumns,
    currentTableName,
    refresh,
    tableIndex,
    mergeColumn,
    showKeys,
    sql,
    editorSql,
    time,
    rangeTime,
    timeRangeValues,
  } = storeToRefs(logsStore)

  // Local state for query data (moved from store)
  const rows = shallowRef([])
  const queryColumns = shallowRef([])

  // Convert queryColumns to the format expected by other components
  const columns = computed(() => {
    return queryColumns.value.map((col) => ({
      name: col.name,
      data_type: col.data_type,
      label: col.name,
      semantic_type: col.semantic_type || (col.data_type?.toLowerCase().includes('timestamp') ? 'TIMESTAMP' : 'FIELD'),
    }))
  })

  // Computed timestamp column from available columns
  const tsColumn = computed(() => {
    if (!columns.value.length) return null

    // Find timestamp columns by data type
    const tsColumns = columns.value.filter((col) => col.data_type.toLowerCase().includes('timestamp'))

    // Prefer columns with TIMESTAMP semantic type
    const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
    const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]

    if (!selectedColumn) return null

    // Extract timestamp precision from data type (e.g., timestamp(3) -> 3)
    const multipleRe = /timestamp\((\d)\)/i
    const timescale = multipleRe.exec(selectedColumn.data_type)
    const multiple = timescale ? 1000 ** (Number(timescale[1]) / 3) : 1000

    return {
      ...selectedColumn,
      multiple,
    }
  })

  // Schema format for SQL editor - group columns by table name
  const schemaForEditor = computed(() => {
    if (!currentTableName.value || !columns.value.length) return {}

    return {
      [currentTableName.value]: columns.value.map((col) => col.name),
    }
  })

  const queryLoading = ref(false)

  // Local query method (moved from store)
  // Placeholder for executeQuery - will be defined after finalQuery

  // Helper function to get column by name
  const getColumnByName = (name) => {
    const index = columns.value.findIndex((column) => column.name === name)
    return columns.value[index]
  }

  // SQLBuilder integration
  const sqlBuilderRef = ref()
  const currentBuilderFormState = ref(null)
  const builderSql = ref('')

  // Handler for TimeRangeSelect updates
  function handleTimeRangeValuesUpdate(newTimeRangeValues) {
    timeRangeValues.value = newTimeRangeValues
  }

  // Time limit for SQLBuilder
  const hasTimeLimit = computed(() => time.value > 0 || rangeTime.value.length > 0)

  // Use timeRangeValues directly for SQLBuilder (no conversion needed)
  const builderTimeRangeValues = computed(() => timeRangeValues.value)

  // Handle SQLBuilder updates
  function handleBuilderSqlUpdate(generatedSql) {
    // Stop live query when user makes changes
    if (refresh.value) {
      refresh.value = false
    }
    builderSql.value = generatedSql
    sql.value = generatedSql
  }

  // Watch for editor type changes - generate editorSql from builder when switching
  watch(editorType, (newMode) => {
    if (newMode === 'text' && !editorSql.value && builderSql.value) {
      // Generate editorSql with placeholders from builder SQL
      let generatedSql = builderSql.value

      // Replace time conditions with placeholders
      if (tsColumn.value) {
        const tsColumnName = tsColumn.value.name
        // Replace time range conditions with placeholders
        generatedSql = generatedSql.replace(
          new RegExp(`${tsColumnName}\\s*>=\\s*[^\\s]+`, 'gi'),
          `${tsColumnName} >= $timestart`
        )
        generatedSql = generatedSql.replace(
          new RegExp(`${tsColumnName}\\s*<=\\s*[^\\s]+`, 'gi'),
          `${tsColumnName} <= $timeend`
        )
      }

      editorSql.value = generatedSql
    }
  })

  // Final query computation with placeholder replacement
  const finalQuery = computed(() => {
    const query = editorType.value === 'builder' ? builderSql.value : editorSql.value

    if (editorType.value === 'text' && tsColumn.value) {
      // Replace placeholders with actual time values
      let processedSql = query

      if (timeRangeValues.value.length === 2) {
        // Use processed time range values directly
        const [startTs, endTs] = timeRangeValues.value
        processedSql = processedSql.replace(/\$timestart/g, `'${startTs}'`).replace(/\$timeend/g, `'${endTs}'`)
      }

      return processedSql
    }

    return query
  })

  // Update sql ref when finalQuery changes
  watch(finalQuery, (newQuery) => {
    if (newQuery) {
      sql.value = newQuery
    }
  })

  // Local query method (moved from store)
  const executeQuery = () => {
    queryLoading.value = true
    return editorAPI
      .runSQL(finalQuery.value)
      .then((result) => {
        queryColumns.value = result.output[0].records.schema.column_schemas
        rows.value = result.output[0].records.rows.map((row, index) => {
          return toObj(row, queryColumns.value, index, tsColumn.value)
        })
      })
      .finally(() => {
        queryLoading.value = false
      })
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

  // Watch for form state changes to update store and handle table changes
  watch(
    currentBuilderFormState,
    (formState) => {
      // Update the current table name in the store
      if (formState?.table) {
        // Stop live query when table changes
        if (refresh.value && currentTableName.value !== formState.table) {
          refresh.value = false
        }
        currentTableName.value = formState.table
      }
    },
    { deep: true }
  )

  // Watch for queryNum changes to trigger query
  watch(queryNum, () => {
    executeQuery()
  })

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

  const showChart = useStorage('logquery-chart-visible', true)
  const compact = useStorage('logquery-table-compact', false)

  const size = computed(() => (compact.value ? 'mini' : 'medium'))
  const wrap = ref(false)
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
      // Reset local state when database changes
      rows.value = []
      queryColumns.value = []
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
