<template lang="pug">
.toolbar
  a-radio-group(v-model="editorType" type="button" @update:modelValue="handleEditorTypeChange")
    a-radio(value="builder")
      | Builder
    a-radio(value="text")
      | Text
  TimeRangeSelect(v-model:time-length="time" v-model:time-range="rangeTime" button-type="outline")
  a-button(
    type="primary"
    size="small"
    :loading="props.queryLoading"
    @click="handleQuery"
  ) 
    template(#icon)
      icon-loading(v-if="props.queryLoading" spin)
      icon-play-arrow(v-else)
    | {{ $t('dashboard.runQuery') }}
  a-checkbox(model-value="refresh" size="small" @update:modelValue="handleRefreshChange")
    span(style="color: var(--color-text-2)") {{ $t('logsQuery.live') }}

  a-space(style="margin-left: auto")
    a-button(
      type="outline"
      size="small"
      :disabled="!executableSql || props.queryLoading"
      @click="exportSql"
    )
      template(#icon)
        svg.icon
          use(href="#export")
      | {{ $t('dashboard.exportCSV') }}
</template>

<script setup name="Toolbar" lang="ts">
  import { ref, watch, nextTick } from 'vue'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import type { ColumnType, TSColumn } from './types'

  interface Props {
    queryLoading?: boolean
    columns?: ColumnType[]
    tsColumn?: TSColumn | null
    refresh: boolean
    executableSql: string
    editorType: 'builder' | 'text'
    time: number
    rangeTime: string[]
  }

  const props = withDefaults(defineProps<Props>(), {
    queryLoading: false,
    columns: () => [],
    tsColumn: null,
    refresh: false,
    executableSql: '',
    editorType: 'builder',
    time: 10,
    rangeTime: () => [],
  })

  const emit = defineEmits([
    'query',
    'update:refresh',
    'export',
    'update:editorType',
    'update:time',
    'update:rangeTime',
  ])

  function handleQuery() {
    emit('query')
  }

  function handleRefreshChange(val: boolean) {
    emit('update:refresh', val)
  }

  function handleEditorTypeChange(val: 'builder' | 'text') {
    emit('update:editorType', val)
  }

  function handleTimeChange(val: number) {
    emit('update:time', val)
  }

  function handleRangeTimeChange(val: string[]) {
    emit('update:rangeTime', val)
  }

  // Live query functionality - simplified
  let refreshTimeout = -1
  function mayRefresh() {
    if (props.refresh && props.executableSql) {
      emit('query')
      refreshTimeout = window.setTimeout(() => {
        mayRefresh()
      }, 3000)
    } else {
      clearTimeout(refreshTimeout)
    }
  }

  watch(
    () => props.refresh,
    (newValue) => {
      if (newValue) {
        mayRefresh()
      } else {
        clearTimeout(refreshTimeout)
      }
    }
  )

  function exportSql() {
    emit('export')
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
