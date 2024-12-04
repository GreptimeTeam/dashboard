<template lang="pug">
.toolbar(
  style="display: flex; gap: 10px; padding: 3px 8px; align-items: center; margin-bottom: 0px; border: 1px solid var(--color-neutral-3)"
)
  a-radio-group(v-model="editorType" type="button" size="small")
    a-radio(value="builder")
      | Builder
    a-radio(value="text")
      | Code
  TimeSelect(
    v-model:time-length="time"
    v-model:time-range="rangeTime"
    button-type="outline"
    button-class="icon-button time-select"
    flex-direction="row-reverse"
    empty-str="Select Time Range"
    button-size="small"
    :relative-time-map="relativeTimeMap"
    :relative-time-options="[{ value: 0, label: 'No Time Limit' }, ...relativeTimeOptions]"
  )
  a-button(
    type="primary"
    size="small"
    :loading="queryLoading"
    @click="handleQuery"
  )
    template(#icon)
      icon-refresh
    | {{ $t('logquery.run') }}
  a-checkbox(v-model="refresh" size="small")
    span(style="color: var(--color-text-2)") {{ $t('logquery.live') }}
  a-button(
    type="text"
    status="normal"
    :loading="saveLoading"
    @click="saveQuery"
  ) {{ $t('logquery.saveSql') }}

  a-space(style="margin-left: auto")
    SavedQuery
    a-trigger(position="bottom" auto-fit-position :unmount-on-close="false")
      a-button(type="text" size="small")
        | {{ $t('logquery.showTables') }}
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
      ExportLog
</template>

<script setup name="Toolbar" lang="ts">
  import { watchOnce, useStorage } from '@vueuse/core'
  import useLogQueryStore from '@/store/modules/logquery'
  import { relativeTimeMap, relativeTimeOptions } from '../../config'
  import { parseTimeRange, processSQL } from './until'
  import SavedQuery from './SavedQuery.vue'
  import ExportLog from './ExportLog.vue'

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
    queryLoading,
    refresh,
  } = storeToRefs(useLogQueryStore())
  // parse time range when ts column confirmed
  watchOnce(tsColumn, () => {
    if (tsColumn.value && editorType.value === 'text') {
      time.value = 0
      const parseResult = parseTimeRange(sqlData.value, tsColumn.value.name, tsColumn.value.multiple)
      if (Array.isArray(parseResult) && parseResult.length === 2) {
        rangeTime.value = parseResult
      } else {
        time.value = parseResult as number
      }
    }
  })

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

  const { query } = useLogQueryStore()
  // const queryLoading = ref(false)

  function handleQuery() {
    if (!inputTableName.value) {
      return
    }
    sqlData.value = editingSql.value
    if (editorType.value === 'text') {
      sqlData.value = processSQL(sqlData.value, tsColumn.value?.name, limit.value)
    }
    if (refresh.value) {
      mayRefresh()
    } else {
      queryNum.value += 1
    }

    // queryLoading.value = true
    // query().finally(() => {
    //   queryLoading.value = false
    // })
  }

  if (sqlData.value) {
    query()
  }

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
    background-color: var(--color-fill-3);
  }
  :deep(.arco-radio-button.arco-radio-checked) {
    color: var(--color-primary);
  }
</style>
