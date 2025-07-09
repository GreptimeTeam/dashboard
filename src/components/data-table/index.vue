<template lang="pug">
a-table(
  :data="data"
  :loading="loading"
  :pagination="false"
  :bordered="false"
  :stripe="false"
  :class="tableClasses"
  :scroll="scrollConfig"
  :size="size"
  :virtual-list-props="virtualListProps"
  :row-selection="rowSelection"
)
  template(#empty)
    a-empty(description="No data")
  template(#loading)
    a-spin(dot)
  template(#columns)
    a-table-column(
      v-for="col in visibleColumns"
      :key="col.name"
      :title="col.name"
      :data-index="col.name"
      :header-cell-style="col.headerCellStyle"
    )
      template(v-if="isTimeColumn(col)" #title)
        a-tooltip(placement="top" :content="tsViewStr ? 'Show raw timestamp' : 'Format timestamp'")
          a-space(size="mini" :style="{ cursor: 'pointer' }" @click="changeTsView")
            svg.icon-12
              use(href="#time-index")
            | {{ col.name }}
      template(#cell="{ record }")
        slot(
          :name="`column-${col.name}`"
          :record="record"
          :column="col"
          :is-time-column="isTimeColumn(col)"
          :rendered-value="getRenderedValue(record, col)"
          :show-context-menu="showContextMenu"
          :handle-context-menu="handleContextMenu"
        )
          // Default cell rendering (fallback when no custom slot provided)
          template(v-if="isTimeColumn(col)")
            span(style="cursor: pointer") {{ renderTs(record, col.name) }}
            svg.td-config-icon(v-if="showContextMenu" @click="(event) => handleContextMenu(record, col.name, event)")
              use(href="#menu")
          template(v-else)
            span {{ record[col.name] }}
            svg.td-config-icon(v-if="showContextMenu" @click="(event) => handleContextMenu(record, col.name, event)")
              use(href="#menu")

// Context menu
a-dropdown#td-context(
  v-model:popup-visible="contextMenuVisible"
  trigger="contextMenu"
  :style="{ position: 'fixed', top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px`, zIndex: 9999 }"
  @clickoutside="hideContextMenu"
  @select="handleMenuClick"
) 
  template(#content)
    a-doption(value="copy") Copy Field Value
    a-dsubmenu(trigger="hover") Filter
      template(#content)
        a-doption(v-for="op in filterOptions" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import { ref, computed, shallowRef } from 'vue'
  import dayjs from 'dayjs'

  interface TSColumn {
    name: string
    multiple?: number
    data_type?: string
  }

  interface Column {
    name: string
    data_type: string
    headerCellStyle?: any
  }

  interface TableData {
    [key: string]: any
  }

  interface Props {
    // Data
    data: TableData[]
    columns: Column[]
    loading?: boolean

    // Table configuration
    size?: 'small' | 'mini' | 'medium' | 'large'
    tableClasses?: string | object
    scrollConfig?: object
    virtualListProps?: object
    rowSelection?: object

    // Timestamp handling
    tsColumn?: TSColumn | null

    // Context menu
    showContextMenu?: boolean
    editorType?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    data: () => [],
    columns: () => [],
    loading: false,
    size: 'medium',
    tableClasses: '',
    scrollConfig: () => ({ y: 1400 }),
    virtualListProps: undefined,
    rowSelection: undefined,
    tsColumn: null,
    showContextMenu: true,
    editorType: 'builder',
  })

  const emit = defineEmits(['filterConditionAdd', 'rowSelect'])

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // All columns are visible - no column management in the core table
  const visibleColumns = computed(() => props.columns)

  // Timestamp utilities
  function isTimeColumn(column: Column) {
    return column.data_type.toLowerCase().includes('timestamp')
  }

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  function renderTs(record: any, columnName: string) {
    if (tsViewStr.value && props.tsColumn?.multiple) {
      // Format timestamp using tsColumn multiple
      const timestamp = record[columnName]
      if (timestamp) {
        const { multiple } = props.tsColumn
        let ms = timestamp

        // Convert based on the timestamp precision
        if (multiple === 1) {
          ms = timestamp * 1000
        } else if (multiple === 1000) {
          ms = timestamp
        } else if (multiple === 1000000) {
          ms = timestamp / 1000
        } else if (multiple === 1000000000) {
          ms = timestamp / 1000000
        } else {
          // General case
          const timescale = (String(multiple).length - 1) / 3
          if (timescale === 0) {
            ms = timestamp * 1000
          } else if (timescale === 1) {
            ms = timestamp
          } else {
            ms = timestamp / 1000 ** (timescale - 1)
          }
        }

        return dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS')
      }
    }
    return record[columnName]
  }

  function getRenderedValue(record: any, column: Column) {
    if (isTimeColumn(column)) {
      return renderTs(record, column.name)
    }
    return record[column.name]
  }

  // No pagination or column management - pure table functionality

  // Context menu functionality
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()

  function handleContextMenu(record: TableData, columnName: string, event: Event) {
    if (!props.showContextMenu || props.editorType !== 'builder') {
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

  function hideContextMenu() {
    contextMenuVisible.value = false
  }

  async function handleMenuClick(value: string | number | Record<string, any>) {
    const action = String(value)
    if (!triggerCell.value) {
      return
    }
    const [record, columnName] = triggerCell.value

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(record[columnName])
        console.log('Copied to clipboard:', record[columnName])
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
      }
    } else if (action.startsWith('filter')) {
      const operator = action.split('_')[1]
      emit('filterConditionAdd', columnName, operator, record[columnName])
    }
    hideContextMenu()
  }

  // Expose methods for parent components
  defineExpose({
    changeTsView,
    renderTs,
  })
</script>

<style lang="less" scoped>
  // Context menu positioning
  #td-context {
    position: absolute;
    z-index: 999999;
  }

  // Menu icon styling
  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }

  // Show menu icon on hover when context menu is enabled
  :deep(.arco-table-cell:hover .td-config-icon) {
    visibility: visible;
  }

  :deep(.arco-table-th) {
    background-color: var(--color-fill-2);
  }

  :deep(.arco-table-td) {
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
</style>
