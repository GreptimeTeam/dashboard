<template lang="pug">
#log-table-container(ref="tableContainer")
  a-table.log_table(
    :key="tableKey"
    style="flex-shrink: 0"
    :size="props.size"
    :data="results"
    :virtual-list-props="{ height: height - headerHeight, buffer: 36 }"
    :pagination="false"
    :row-selection="rowSelection"
    :bordered="false"
    :class="{ wrap_table: wrapLine, single_column: mergeColumn, multiple_column: !mergeColumn, builder_type: sqlMode === 'builder', compact: isCompact }"
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
                | {{ tsColumn && tsColumn.name }}
        a-table-column(
          v-else-if="mergeColumn"
          :data-index="column.dataIndex"
          :title="column.title"
          :header-cell-style="column.headerCellStyle"
        )
          template(#cell="{ record }")
            span.entity-field(v-for="field in getEntryFields(record)")
              span(v-if="showKeys" style="color: var(--color-text-3)")
                | {{ field[0] }}:
              | {{ field[1] }}
              svg.td-config-icon(
                v-if="sqlMode === 'builder'"
                @click="(event) => handleContextMenu(record, field[0], event)"
              )
                use(href="#menu")
        a-table-column.clickable(
          v-else
          :data-index="column.dataIndex"
          :title="column.title"
          :header-cell-style="column.headerCellStyle"
        )
          template(#cell="{ record }")
            span {{ record[column.dataIndex] }}
            svg.td-config-icon(
              v-if="sqlMode === 'builder'"
              @click="(event) => handleContextMenu(record, column.dataIndex, event)"
            )
              use(href="#menu")

  LogDetail(v-model:visible="detailVisible" :record="selectedRecord")
  a-dropdown#td-context(
    v-model:popup-visible="contextMenuVisible"
    trigger="contextMenu"
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
  import { ref, computed, watch, shallowRef } from 'vue'
  import type { PropType } from 'vue'
  import { Message } from '@arco-design/web-vue'
  import { useElementSize, useLocalStorage } from '@vueuse/core'
  import LogDetail from './LogDetail.vue'
  import { toDateStr, TimeTypes } from './until'
  import type { ColumnType, TSColumn } from './types'

  interface TableData {
    [key: string]: any
  }

  const props = withDefaults(
    defineProps<{
      wrapLine: boolean
      size: 'small' | 'mini' | 'medium' | 'large'
      data: TableData[]
      columns: ColumnType[]
      sqlMode: string
      tsColumn: TSColumn | null
      columnMode: 'separate' | 'merged' | 'merged-with-keys'
      displayedColumns: string[]
    }>(),
    {
      wrapLine: false,
      size: 'medium',
      data: () => [],
      columns: () => [],
      sqlMode: 'editor',
      tsColumn: null,
      columnMode: 'separate',
      displayedColumns: () => [],
    }
  )

  const emit = defineEmits(['filterConditionAdd', 'rowSelect'])

  // Computed paginated results
  const results = computed(() => {
    console.log('props.data', props.data)
    return props.data
  })

  // Local state for row selection
  const selectedRowKey = ref(null)
  const selectedRecord = computed(() => {
    return props.data.find((row) => row.key === selectedRowKey.value)
  })

  // Derived values from columnMode
  const mergeColumn = computed(() => props.columnMode !== 'separate')
  const showKeys = computed(() => props.columnMode === 'merged-with-keys')

  // Timestamp utilities
  const tsViewStr = ref(true)
  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  const renderTs = (record: any, columnName: string) => {
    if (tsViewStr.value) {
      return toDateStr(record[columnName], props.tsColumn?.multiple)
    }
    return record[columnName]
  }

  // Timestamp utilities
  function isTimeColumn(column: ColumnType | string) {
    if (typeof column === 'string') {
      // Find column by name
      const col = props.columns.find((c) => c.name === column)
      return col ? col.data_type.toLowerCase().includes('timestamp') : false
    }
    return column.data_type.toLowerCase().includes('timestamp')
  }

  const tableContainer = ref(null)
  const { width: tableWidth, height } = useElementSize(tableContainer)

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
    const row = results.value[0] as any
    if (!row) {
      return []
    }
    let tmpColumns = props.columns.slice()
    if (props.tsColumn) {
      tmpColumns = tmpColumns.filter((c) => c.name !== props.tsColumn.name)
      tmpColumns.unshift(props.tsColumn)
    }
    tmpColumns = tmpColumns.filter((c) => props.displayedColumns?.indexOf(c.name) > -1)
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
    if (props.tsColumn) {
      arr.push({
        dataIndex: props.tsColumn.name,
        title: props.tsColumn.name,
        headerCellStyle: { width: tsViewStr.value ? '220px' : '170px' },
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
    if (!props.tsColumn) {
      return props.displayedColumns
    }
    return props.displayedColumns.filter((field) => field !== props.tsColumn.name)
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
    type: 'radio' as const,
    checkStrictly: false,
    selectedRowKeys: computed(() => [selectedRowKey.value]),
  })

  const detailVisible = ref(false)

  const handleTsClick = (row) => {
    selectedRowKey.value = row.key
    emit('rowSelect', row)
    detailVisible.value = true
  }

  const isCompact = useLocalStorage('logquery-table-compact', false)
  const headerHeight = computed(() => {
    return isCompact.value ? 25 : 38
  })
  const tableKey = ref('table')

  // Watch for data changes to refresh table
  watch([() => props.data, tableColumns], () => {
    tableKey.value = `table_${Math.random()}`
  })

  // Context menu functionality
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()

  function handleContextMenu(record: TableData, columnName: string, event: Event) {
    if (props.sqlMode !== 'builder') {
      return
    }
    const rect = (event.target as Element).getBoundingClientRect()
    triggerCell.value = [record, columnName]
    event.preventDefault()

    // Set available filter options based on column type
    const column = props.columns.find((col) => col.name === columnName)
    if (column) {
      if (isTimeColumn(column)) {
        filterOptions.value = ['>=', '<=']
      } else {
        filterOptions.value = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
      }
    }

    contextMenuPosition.value = { x: rect.left, y: rect.y }
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
    if (action === 'copy') {
      await navigator.clipboard.writeText(row[columnName])
      Message.success('copy success')
    } else if (action.startsWith('filter')) {
      const operator = action.split('_')[1]
      // Emit filter condition to parent instead of directly modifying store
      emit('filterConditionAdd', columnName, operator, row[columnName])
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
  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }
  .multiple_column:not(.arco-table-empty) {
    :deep(.arco-table-td-content) {
      position: relative;
      width: auto;
      padding-right: 15px;
    }
    .td-config-icon {
      position: absolute;
      right: 0;
      top: 5px;
    }
  }
  .compact.multiple_column {
    :deep(.arco-table-td-content) {
      padding-right: 12px;
    }
    .td-config-icon {
      top: 4px;
    }
  }
  .compact .td-config-icon {
    width: 9px;
    height: 9px;
  }
  .multiple_column.builder_type :deep(.arco-table-cell:hover) .td-config-icon {
    visibility: visible;
  }
  .single_column.builder_type .entity-field:hover .td-config-icon {
    visibility: visible;
  }
</style>
