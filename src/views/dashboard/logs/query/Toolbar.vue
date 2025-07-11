<template lang="pug">
.toolbar
  a-radio-group(v-model="editorType" type="button")
    a-radio(value="builder")
      | Builder
    a-radio(value="text")
      | Text
  TimeRangeSelect(
    v-model:time-length="time"
    v-model:time-range="rangeTime"
    button-type="outline"
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

  a-space(style="margin-left: auto")
    ExportLog(:columns="props.columns" :ts-column="props.tsColumn")
</template>

<script setup name="Toolbar" lang="ts">
  import { ref, watch, nextTick } from 'vue'
  import { storeToRefs } from 'pinia'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { parseTimeRange, processSQL, parseTable, parseLimit, addTsCondition } from './until'
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
    time,
    editorType,
    currentTableName,
    limit,
    timeRangeValues,
    refresh,
  } = storeToRefs(useLogsQueryStore())

  const emit = defineEmits(['timeRangeValuesUpdate', 'query'])

  function handleQuery() {
    // Simply emit the query event - let parent handle the logic
    emit('query')
  }

  // Live query functionality - simplified
  let refreshTimeout = -1
  function mayRefresh() {
    if (refresh.value && sqlData.value) {
      emit('query')
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
