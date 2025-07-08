<template lang="pug">
.toolbar(
  style="display: flex; gap: 10px; padding: 3px 8px; align-items: center; margin-bottom: 0px; border: 1px solid var(--color-neutral-3)"
)
  a-radio-group(v-model="editorType" type="button" size="small")
    a-radio(value="builder")
      | Builder
    a-radio(value="text")
      | Code
  TimeRangeSelect(v-model:time-length="time" v-model:time-range="rangeTime")
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
    a-trigger(position="bottom" auto-fit-position :unmount-on-close="false")
      a-button(type="text" size="small")
        | {{ $t('logsQuery.showTables') }}
      template(#content)
        a-card(style="width: 500px; padding: 10px")
          a-select(v-model="selectedTable" :options="tables" :allow-search="true")
          div(style="margin-top: 20px")
            div(style="display: flex; gap: 10px; flex-wrap: wrap")
              a-typography-text(copyable :copy-text="selectedTable")
                | {{ selectedTable }}
              span(v-for="field in tableMap[selectedTable] || []" style="display: flex; flex-wrap: wrap; gap: 0px")
                a-typography-text(copyable :copy-text="field.name")
                  | {{ field.name }} : {{ field.data_type }}
      ExportLog(:columns="props.columns" :ts-column="props.tsColumn")
</template>

<script setup name="Toolbar" lang="ts">
  import { watchOnce, useStorage } from '@vueuse/core'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import { parseTimeRange, processSQL, parseTable, parseLimit, addTsCondition } from './until'
  import SavedQuery from './SavedQuery.vue'
  import ExportLog from './ExportLog.vue'

  const props = defineProps({
    queryLoading: Boolean,
    columns: Array,
    tsColumn: Object,
  })

  const {
    sql: sqlData,
    rangeTime,
    tsColumn,
    queryNum,
    time,
    editorType,
    inputTableName,
    tableMap,
    editingSql,
    limit,
    refresh,
    editingTableName,
    editingTsColumn,
  } = storeToRefs(useLogsQueryStore())
  const { getRelativeRange } = useLogsQueryStore()

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
  watch([refresh], () => {
    mayRefresh()
  })

  // queryLoading is now passed as prop from parent

  function handleQuery() {
    if (!editingTableName.value) {
      return
    }
    inputTableName.value = editingTableName.value
    tsColumn.value = editingTsColumn.value
    if (editorType.value === 'text') {
      inputTableName.value = parseTable(editingSql.value)

      limit.value = parseLimit(editingSql.value)

      if (tsColumn.value) {
        const { multiple } = tsColumn.value
        const [start, end] = getRelativeRange(multiple)
        if (start && end) {
          editingSql.value = addTsCondition(editingSql.value, tsColumn.value.name, start, end)
        }
      }
      editingSql.value = processSQL(editingSql.value, tsColumn.value?.name, limit.value)
    }
    sqlData.value = editingSql.value
    nextTick(() => {
      if (refresh.value) {
        mayRefresh()
      } else {
        queryNum.value += 1
      }
    })

    // queryLoading.value = true
    // query().finally(() => {
    //   queryLoading.value = false
    // })
  }

  // Initial query is now handled by parent component

  const selectedTable = ref<string>('')
  // set init selected table for tips
  watchOnce(inputTableName, () => {
    selectedTable.value = inputTableName.value
  })

  const saveLoading = ref(false)
  const saveQuery = () => {
    if (!inputTableName.value) {
      return
    }
    saveLoading.value = true
    const queryList = useStorage<Array<string>>('log-query-list', [])
    if (queryList.value.indexOf(editingSql.value) === -1) {
      queryList.value.unshift(editingSql.value)
    }
    setTimeout(() => {
      saveLoading.value = false
    }, 100)
  }

  const tables = computed<Array<string>>(() => {
    return Object.keys(tableMap.value)
  })

  watchOnce(tables, () => {
    if (!selectedTable.value) {
      selectedTable.value = tables.value[0]
    }
  })
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
