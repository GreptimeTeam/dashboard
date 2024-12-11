<template lang="pug">
#log-table-container(ref="tableContainer")
  a-table.log_table(
    :key="tableKey"
    style="flex-shrink: 0"
    :size="props.size"
    :data="rows"
    :virtual-list-props="{ height: height - headerHeight, buffer: 36 }"
    :pagination="false"
    :row-selection="rowSelection"
    :bordered="false"
    :class="{ wrap_table: wrapLine, single_column: mergeColumn, multiple_column: !mergeColumn, builder_type: editorType === 'builder' }"
  )
    template(#columns)
      template(v-for="column in tableColumns")
        a-table-column(
          v-if="isTimeColumn(column.dataIndex)"
          :data-index="column.dataIndex"
          :title="column.title"
          :header-cell-style="column.headerCellStyle"
        )
          template(#cell="{ record }")
            span(style="cursor: pointer" @click="() => handleTsClick(record)") {{ renderTs(record, column.dataIndex) }}
          template(#title)
            a-tooltip(
              placement="top"
              :content="tsViewStr ? $t('dashboard.showTimestamp') : $t('dashboard.formatTimestamp')"
            )
              a-space(size="mini" :style="{ cursor: 'pointer' }" @click="changeTsView")
                svg.icon-12
                  use(href="#time-index")
                | {{ tsColumn.name }}
        a-table-column(
          v-else-if="mergeColumn"
          :data-index="column.dataIndex"
          :title="column.title"
          :header-cell-style="column.headerCellStyle"
        )
          template(#cell="{ record }")
            span.entity-field.clickable(
              v-for="field in getEntryFields(record)"
              @click="(event) => handleContextMenu(record, field[0], event)"
            )
              template(v-if="showKeys")
                span(style="color: var(--color-text-3)")
                  | {{ field[0] }}:
                | {{ field[1] }}
              template(v-else)
                | {{ field[1] }}
        a-table-column.clickable(
          v-else
          :data-index="column.dataIndex"
          :title="column.title"
          :header-cell-style="column.headerCellStyle"
        )
          template(#cell="{ record }")
            span.clickable(@click="(event) => handleContextMenu(record, column.dataIndex, event)") {{ record[column.dataIndex] }}

  LogDetail(v-model:visible="detailVisible")
  a-dropdown#td-context(
    v-model:popup-visible="contextMenuVisible"
    trigger="custom"
    :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
    @clickoutside="hideContextMenu"
    @select="handleMenuClick"
  ) 
    template(#content)
      a-doption(value="copy") Copy Field Value
      a-dsubmenu(trigger="hover") Filter
        template(#content)
          a-doption(v-for="op in filterOptions" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts" name="LogTableData">
  import { Message } from '@arco-design/web-vue'
  import { useElementSize, useLocalStorage } from '@vueuse/core'
  import useLogQueryStore from '@/store/modules/logquery'
  import LogDetail from './LogDetail.vue'
  import { toDateStr, TimeTypes } from './until'

  const props = defineProps({ wrapLine: Boolean, size: String })
  const { getColumnByName, query } = useLogQueryStore()
  const { displayedColumns } = storeToRefs(useLogQueryStore())
  const {
    rows,
    currRow,
    selectedRowKey,
    queryNum,
    sql,
    tsColumn,
    inputTableName,
    mergeColumn,
    dataLoadFlag,
    showKeys,
    queryColumns,
    queryForm,
    editingSql,
    editorType,
  } = storeToRefs(useLogQueryStore())

  const { getOpByField } = useLogQueryStore()
  const tsViewStr = ref(true)
  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }
  const tableContainer = ref(null)
  const { width: tableWidth, height } = useElementSize(tableContainer)

  const renderTs = (record: any, columnName: string) => {
    if (tsViewStr.value) {
      return toDateStr(record[columnName], tsColumn.value?.multiple)
    }
    return record[columnName]
  }

  const isTimeColumn = (name: string) => {
    const columnMeta = getColumnByName(name)
    if (columnMeta && columnMeta.data_type.indexOf('timestamp') > -1) {
      return true
    }
    return false
  }

  function findMaxLenCol(row) {
    let max = 0
    let maxName = ''
    Object.keys(row).forEach((k) => {
      if (String(row[k]).length > max) {
        max = String(row[k]).length
        maxName = k
      }
    })
    return maxName
  }

  const seperateColumns = computed(() => {
    const row = rows.value[0] as any
    if (!row) {
      return []
    }
    let tmpColumns = queryColumns.value.slice()
    if (tsColumn.value) {
      tmpColumns = tmpColumns.filter((c) => c.name !== tsColumn.value.name)
      tmpColumns.unshift(tsColumn.value)
    }
    tmpColumns = tmpColumns.filter((c) => displayedColumns.value[inputTableName.value]?.indexOf(c.name) > -1)
    let totalStrLen = -1

    if (row) {
      totalStrLen = Object.keys(row).reduce((acc, curr) => {
        acc += String(row[`${curr}`]).length
        return acc
      }, 0)
    }

    const maxLenName = findMaxLenCol(row)
    function getWidth(currLen: number, totalLen: number) {
      let width = (Math.floor((currLen / totalLen) * 1000) / 1000) * tableWidth.value
      width = Math.max(150, width)
      width = Math.min(600, width)
      return `${width}px`
    }

    return tmpColumns.map((column, index) => {
      const widthStr = row && column.name !== maxLenName ? getWidth(`${row[column.name]}`.length, totalStrLen) : 'auto'
      const style = { width: widthStr }
      return {
        dataIndex: column.name,
        title: column.name,
        headerCellStyle: style,
      }
    })
  })

  const mergedColumns = computed(() => {
    const arr = []
    if (tsColumn.value) {
      arr.push({
        dataIndex: tsColumn.value.name,
        title: tsColumn.value.name,
        headerCellStyle: { width: '170px' },
      })
    }
    arr.push({
      dataIndex: 'Merged_Column',
      title: 'Data',
      headerCellStyle: { width: 'auto' },
    })
    return arr
  })

  const dataFields = computed(() => {
    if (!tsColumn.value) {
      return displayedColumns.value[inputTableName.value]
    }
    return displayedColumns.value[inputTableName.value].filter((field) => field !== tsColumn.value.name)
  })
  const getEntryFields = (record) => {
    const copyRecord = { ...record }
    delete copyRecord.index
    Object.keys(copyRecord).forEach((k) => {
      if (dataFields.value.indexOf(k) === -1) {
        delete copyRecord[k]
      }
    })

    return Object.entries(copyRecord)
  }

  const tableColumns = computed(() => {
    return mergeColumn.value ? mergedColumns.value : seperateColumns.value
  })

  const rowSelection = ref({
    type: 'radio',
    checkStrictly: false,
    selectedRowKeys: computed(() => [selectedRowKey.value]),
  })

  const detailVisible = ref(false)

  const handleTsClick = (row) => {
    selectedRowKey.value = row.key
    detailVisible.value = true
  }

  watch(queryNum, () => {
    query()
  })
  const isCompact = useLocalStorage('logquery-table-compact', false)
  const headerHeight = computed(() => {
    return isCompact.value ? 25 : 38
  })
  const tableKey = ref('table')
  watch([dataLoadFlag, tableColumns], () => {
    tableKey.value = `table_${Math.random()}`
  })

  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()
  const handleContextMenu = (row, columnName, event) => {
    if (editorType.value !== 'builder') {
      return
    }
    triggerCell.value = [row, columnName]
    event.preventDefault()
    filterOptions.value = getOpByField(columnName)
    contextMenuPosition.value = { x: event.clientX, y: event.clientY }
    contextMenuVisible.value = true
  }
  const hideContextMenu = () => {
    contextMenuVisible.value = false
  }
  const handleMenuClick = async (action) => {
    if (!triggerCell.value) {
      return
    }
    const [row, columnName] = triggerCell.value
    const columnMeta = getColumnByName(columnName)
    if (action === 'copy') {
      await navigator.clipboard.writeText(row[columnName])
      Message.success('copy success')
    } else if (action.startsWith('filter')) {
      queryForm.value.conditions.push({
        field: columnMeta,
        op: action.split('_')[1],
        value: row[columnName],
        rel: 'and',
      })

      nextTick(() => {
        sql.value = editingSql.value
        queryNum.value += 1
      })
    }
    hideContextMenu()
  }
</script>

<style lang="less" scoped>
  :deep(.arco-table-tr .arco-table-operation:first-child) {
    display: none;
  }
  :deep(.arco-table-selection-radio-col) {
    display: none;
  }
  #log-table-container {
    position: relative;
  }
  :deep(.arco-drawer-container) {
    left: auto;
    width: 800px;
    overflow: hidden;
  }
  .builder_type .clickable {
    cursor: pointer;
  }
  :deep(.arco-drawer) {
    border: 1px solid var(--color-neutral-3);
  }
  .log_table.multiple_column {
    :deep(.arco-virtual-list > .arco-table-element) {
      width: 100%;
    }
    width: 100%;
    :deep(.arco-table-td-content) {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  :deep(.arco-table-element) {
    font-family: 'Roboto Mono', monospace;
  }

  .log_table :deep(.arco-table-td),
  .log_table :deep(.arco-table-th) {
    white-space: nowrap;
  }
  .log_table.wrap_table :deep(.arco-table-td),
  .log_table.wrap_table :deep(.arco-table-th) {
    white-space: wrap;
  }
  :deep(.arco-table-size-medium .arco-table-cell) {
    padding: 7px 10px;
  }
  .entity-field {
    margin-right: 10px;
    // background-color: var(--color-neutral-2);
    // border-radius: 2px;
  }
  // .single_column.arco-table :deep(.arco-table-td) {
  //   border: none;
  // }
  // :deep(.arco-table-tr:hover) .entity-field {
  //   background-color: #fff;
  // }
  #td-context {
    position: absolute;
    z-index: 999999;
  }
</style>
