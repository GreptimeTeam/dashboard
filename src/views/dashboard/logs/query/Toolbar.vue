<template lang="pug">
.toolbar(
  style="display: flex; gap: 10px; padding: 3px 8px; align-items: center; margin-bottom: 0px; border: 1px solid var(--color-neutral-3)"
)
  a-radio-group(v-model="editorType" type="button" size="small")
    a-radio(value="builder")
      | Builder
    a-radio(value="text")
      | Code
  TimeRangeSelect(
    v-model:time-length="time"
    v-model:time-range="rangeTime"
    @update:time-range-values="handleTimeRangeValuesUpdate"
  )
  a-button(
    type="primary"
    size="small"
    :loading="props.queryLoading"
    @click="handleQuery"
  )
    template(#icon)
      icon-refresh
    | {{ $t('logsQuery.run') }}
  a-checkbox(v-model="refresh" size="small")
    span(style="color: var(--color-text-2)") {{ $t('logsQuery.live') }}
  a-button(
    type="text"
    status="normal"
    :loading="saveLoading"
    @click="saveQuery"
  ) {{ $t('logsQuery.saveSql') }}

  a-space(style="margin-left: auto")
    SavedQuery
    a-trigger(
      v-if="props.columns.length"
      position="bottom"
      auto-fit-position
      :unmount-on-close="false"
    )
      a-button(type="text" size="small")
        | {{ $t('logsQuery.showTables') }}
      template(#content)
        a-card(style="width: 500px; padding: 10px")
          div(style="display: flex; gap: 10px; flex-wrap: wrap")
            span(v-for="field in props.columns" :key="field?.name" style="display: flex; flex-wrap: wrap; gap: 0px")
              a-typography-text(copyable :copy-text="field?.name")
                | {{ field?.name }} : {{ field?.data_type }}
    ExportLog(:columns="props.columns" :ts-column="props.tsColumn")
</template>

<script setup name="Toolbar" lang="ts">
  import { ref, watch, nextTick } from 'vue'
  import { watchOnce, useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { parseTimeRange, processSQL, parseTable, parseLimit, addTsCondition } from './until'
  import SavedQuery from './SavedQuery.vue'
  import ExportLog from './ExportLog.vue'
  import type { ColumnType, TSColumn } from './types'

  interface Props {
    queryLoading?: boolean
    columns?: ColumnType[]
    tsColumn?: TSColumn | null
  }

  const props = withDefaults(defineProps<Props>(), {
    queryLoading: false,
    columns: () => [],
    tsColumn: null,
  })

  const {
    sql: sqlData,
    rangeTime,
    queryNum,
    time,
    editorType,
    currentTableName,
    editorSql,
    limit,
    refresh,
    timeRangeValues,
  } = storeToRefs(useLogsQueryStore())

  const emit = defineEmits(['timeRangeValuesUpdate'])

  function handleQuery() {
    if (!currentTableName.value) {
      return
    }

    // Stop live query when user manually triggers a query
    if (refresh.value) {
      refresh.value = false
    }

    if (editorType.value === 'text') {
      currentTableName.value = parseTable(editorSql.value)
      limit.value = parseLimit(editorSql.value)
      // No need to add TS condition - SQL should already have $timestart/$timeend placeholders
      // The finalQuery computation will handle placeholder replacement
      editorSql.value = processSQL(editorSql.value, props.tsColumn?.name, limit.value)
    }
    sqlData.value = editorSql.value
    nextTick(() => {
      queryNum.value += 1
    })
  }

  const saveLoading = ref(false)
  const saveQuery = () => {
    if (!currentTableName.value) {
      return
    }
    saveLoading.value = true
    const queryList = useStorage<Array<string>>('log-query-list', [])
    if (queryList.value.indexOf(editorSql.value) === -1) {
      queryList.value.unshift(editorSql.value)
    }
    setTimeout(() => {
      saveLoading.value = false
    }, 100)
  }

  // Live query functionality - simplified
  let refreshTimeout = -1
  function mayRefresh() {
    if (refresh.value && sqlData.value) {
      queryNum.value += 1
      refreshTimeout = window.setTimeout(() => {
        mayRefresh()
      }, 3000)
    } else {
      clearTimeout(refreshTimeout)
    }
  }

  // Watch for refresh toggle to start/stop live queries
  watch(refresh, (newValue) => {
    if (newValue) {
      mayRefresh()
    } else {
      clearTimeout(refreshTimeout)
    }
  })

  // Handler for TimeRangeSelect updates
  function handleTimeRangeValuesUpdate(newTimeRangeValues: string[]) {
    emit('timeRangeValuesUpdate', newTimeRangeValues)
  }
</script>

<style scoped lang="less">
  :deep(.arco-btn-text[type='button']) {
    color: var(--color-text-2);
  }
  :deep(.arco-radio-group-button) {
    background-color: #fff;
  }
  :deep(.arco-radio-button.arco-radio-checked) {
    color: var(--color-primary);
  }
  :deep(.arco-radio-button.arco-radio-checked) {
    background-color: #a376ff33 !important;
  }
</style>
