<template lang="pug">
a-card.data-grid(:bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-20
        use(href="#table")
      | {{ $t('dashboard.table') }}
  a-space.toolbar(v-if="hasExpandableContent")
    a-checkbox(v-model="wrapLines" size="small" @change="toggleLineWrapping")
      | {{ $t('dashboard.wrapLines') }}
  a-spin.table-spin
    a-table(
      column-resizable
      size="mini"
      :data="gridData"
      :pagination="pagination"
      :scroll="{ y: '100%', x: tableWidth }"
      :bordered="{ headerCell: true }"
    )
      template(#empty)
        EmptyStatus
      template(#columns)
        template(v-for="column in gridColumns" :key="column.title")
          template(v-if="timeColumnNames.includes(column.title)")
            a-table-column(
              :width="timeColumnWidth"
              :data-index="timeColumnFormatMap[column.dataIndex] ? `${column.dataIndex}${formatSuffix}` : column.dataIndex"
            )
              template(#title)
                a-tooltip(
                  placement="top"
                  :content="timeColumnFormatMap[column.dataIndex] ? $t('dashboard.showTimestamp') : $t('dashboard.formatTimestamp')"
                )
                  a-space(
                    size="mini"
                    :style="{ cursor: 'pointer' }"
                    @click="() => handleFormatTimeColumn(column.dataIndex, column.dataType)"
                  )
                    svg.icon-12
                      use(href="#time-index")
                    | {{ column.title }}
          template(v-else)
            a-table-column(
              :tooltip="column.tooltip"
              :title="column.title"
              :data-index="column.dataIndex"
              :ellipsis="false"
              :width="getColumnWidth(column)"
            )
              template(#cell="{ record, rowIndex }")
                .cell-wrapper(
                  :class="{ 'expandable-cell': needsExpansion(record[column.dataIndex], record.__types?.[column.dataIndex]) }"
                  @click="toggleCell(rowIndex, column.dataIndex)"
                  @mouseenter="hoveredCell = `${rowIndex}-${column.dataIndex}`"
                  @mouseleave="hoveredCell = null"
                )
                  .cell-content(
                    :class="{ expanded: expandedCells[`${rowIndex}-${column.dataIndex}`], 'wrap-lines': wrapLines }"
                  )
                    | {{ record[column.dataIndex] }}
                  .cell-copy-button(
                    v-if="isCellVisiblyExpanded(rowIndex, column.dataIndex) && hoveredCell === `${rowIndex}-${column.dataIndex}`"
                    @click.stop="copyContent(record[column.dataIndex])"
                  )
                    svg.icon-14
                      use(href="#copy-new")
</template>

<script lang="ts" setup>
  import { dateTypes, numberTypes } from '@/views/dashboard/config'
  import type { ResultType, SchemaType } from '@/store/modules/code-run/types'
  import { dateFormatter } from '@/utils'
  import { Message } from '@arco-design/web-vue'
  import i18n from '@/locale'
  import { useClipboard } from '@vueuse/core'

  const props = withDefaults(
    defineProps<{
      data: ResultType
      hasHeader?: boolean
    }>(),
    {
      data: () => {
        return {} as ResultType
      },
      hasHeader: true,
    }
  )

  const wrapLines = ref(false)
  const timeColumnWidth = 140
  const toolbarHeight = '20px'

  const MIN_COLUMN_WIDTHS = {
    timestamp: timeColumnWidth,
    boolean: 80,
  }

  const pagination = ref({
    'total': props.data?.records.rows.length,
    'show-page-size': true,
    'show-total': true,
    'show-jumper': true,
  })

  // replace '.' with '-' to make it a valid data-index
  // useful when '.' is used in column name, such as `SELECT 1.1`, `SELECT 1 AS a.b`
  function columnNameToDataIndex(columnName: string) {
    return columnName.replace(/\./gi, '-')
  }

  const timeColumnNames = computed(() => {
    const { schema } = props.data.records
    if (!schema) return []
    return props.data.records.schema.column_schemas
      .filter((column: SchemaType) => dateTypes.includes(column.data_type))
      .map((column: SchemaType) => column.name)
  })

  const gridColumns = computed(() => {
    const { schema } = props.data.records
    if (!schema) return []

    // use sort to make time columns display on the left first
    return schema.column_schemas
      .map((column: SchemaType) => {
        return {
          title: column.name,
          dataIndex: columnNameToDataIndex(column.name),
          dataType: column.data_type,
          ellipsis: true,
          tooltip: { 'content-class': 'cell-data-tooltip', 'position': 'tl' },
        }
      })
      .sort((a: any, b: any) => {
        return +timeColumnNames.value.includes(b.title) - +timeColumnNames.value.includes(a.title)
      })
  })

  // use ref to make it mutable
  const gridData = computed(() => {
    return props.data.records.rows.map((row: any) => {
      const tempRow: any = {}
      // Add a __types object to store data types
      tempRow.__types = {}

      row.forEach((item: any, index: number) => {
        const columnName = columnNameToDataIndex(props.data.records.schema.column_schemas[index].name)
        const type = props.data.records.schema.column_schemas[index].data_type

        tempRow.__types[columnName] = type

        // If item is a big number (as string), convert it to Number for table to show
        if (numberTypes.includes(type) && typeof item === 'string') {
          item = Number(item)
        }
        tempRow[columnName] = item
      })
      return tempRow
    })
  })

  const calculateTextWidth = (text) => {
    if (!text) return 0

    const charWidths = {
      default: 7.2, // average character width
      narrow: 5.4, // narrow characters: i, l, j, t, f, r
      wide: 10.8, // m, w, etc.
      uppercase: 9, // A-Z
    }

    let width = 0
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]
      if (char.match(/[A-Z]/)) {
        width += charWidths.uppercase
      } else if (char.match(/[iljtfr]/)) {
        width += charWidths.narrow
      } else if (char.match(/[mw]/)) {
        width += charWidths.wide
      } else {
        width += charWidths.default
      }
    }
    const PADDING = 16 * 2
    return Math.ceil(width) + PADDING
  }

  const getColumnWidth = (column) => {
    const titleWidth = calculateTextWidth(column.title)

    if (timeColumnNames.value.includes(column.title)) {
      return Math.max(titleWidth, MIN_COLUMN_WIDTHS.timestamp)
    }
    if (column.dataType && column.dataType.toLowerCase() === 'boolean') {
      return Math.max(titleWidth, MIN_COLUMN_WIDTHS.boolean)
    }

    return Math.max(titleWidth, 80)
  }

  const tableWidth = computed(() => {
    if (!gridColumns.value.length) return '100%'

    const calculatedWidth = gridColumns.value.reduce((total, column) => total + getColumnWidth(column), 0)

    return `${calculatedWidth}px`
  })

  /**
   * use an extra state to store which time column is formatted
   * key is data-index instead of column name
   */
  const timeColumnFormatMap = ref(
    Object.fromEntries(
      timeColumnNames.value.map((columnName: string) => {
        return [columnNameToDataIndex(columnName), false]
      })
    )
  )

  const formatSuffix = '--FORMATTED'

  const handleFormatTimeColumn = (dataIndex: string, dataType: string) => {
    timeColumnFormatMap.value[dataIndex] = !timeColumnFormatMap.value[dataIndex]
    // calculate formatted time data on first access
    if (gridData.value.length && !gridData.value[0][`${dataIndex}${formatSuffix}`]) {
      gridData.value.forEach((row: any) => {
        row[`${dataIndex}${formatSuffix}`] = dateFormatter(dataType, row[dataIndex])
      })
    }
  }

  // Track currently hovered cell
  const hoveredCell = ref(null)
  const expandedCells = ref({})
  const allExpanded = ref(false)

  const needsExpansion = (content: any, dataType?: string) => {
    if (content === null || content === undefined) return false

    const numericTypes = [...numberTypes, 'Decimal']
    if (numericTypes.includes(dataType)) return false

    if (dataType === 'Boolean') return false

    if (dateTypes.includes(dataType)) return false

    if (['JSON', 'Interval'].includes(dataType)) return true

    if (dataType === 'Binary') return true

    try {
      if (typeof content === 'object') {
        return true
      }

      const str = String(content || '')
      const isComplexStructure =
        (str.startsWith('[') && str.endsWith(']')) ||
        (str.startsWith('{') && str.endsWith('}')) ||
        /\[[^\]]+\]|\{[^}]+\}/.test(str)

      return str.length > 100 || str.includes('\n') || isComplexStructure
    } catch (error) {
      console.warn('Failed to convert cell content to string:', error)
      return true
    }
  }

  const isCellVisiblyExpanded = (rowIndex, columnKey) => {
    return wrapLines.value || expandedCells.value[`${rowIndex}-${columnKey}`]
  }

  const hasExpandableContent = computed(() => {
    if (!gridData.value || gridData.value.length === 0) return false

    return gridData.value.some((row) =>
      Object.keys(row).some((key) => {
        if (key === '__types') return false
        return needsExpansion(row[key], row.__types?.[key])
      })
    )
  })

  const toggleCell = (rowIndex, columnKey, forceExpand = false) => {
    const key = `${rowIndex}-${columnKey}`
    if (forceExpand) {
      expandedCells.value[key] = true
    } else if (!expandedCells.value[key]) {
      expandedCells.value[key] = true
    }
  }

  const toggleLineWrapping = () => {
    let hasUnexpandedCells = false

    gridData.value.forEach((row, rowIndex) => {
      Object.keys(row).forEach((key) => {
        if (needsExpansion(row[key])) {
          const cellKey = `${rowIndex}-${key}`
          if (!expandedCells.value[cellKey]) {
            hasUnexpandedCells = true
          }
        }
      })
    })

    const shouldExpandAll = hasUnexpandedCells
    allExpanded.value = shouldExpandAll
    const newExpandedState = {}
    gridData.value.forEach((row, rowIndex) => {
      Object.keys(row).forEach((key) => {
        if (needsExpansion(row[key])) {
          newExpandedState[`${rowIndex}-${key}`] = shouldExpandAll
        }
      })
    })

    expandedCells.value = newExpandedState
  }

  const copyContent = (content: unknown) => {
    if (content === null || content === undefined) return

    let textToCopy = ''

    if (typeof content === 'string' || typeof content === 'number' || typeof content === 'boolean') {
      textToCopy = String(content)
    } else if (typeof content === 'object') {
      try {
        textToCopy = JSON.stringify(content, null, 2)
      } catch {
        textToCopy = '[Unsupported Object]'
      }
    } else {
      textToCopy = String(content)
    }

    const { copy, copied } = useClipboard({ source: textToCopy })
    copy()

    watch(
      copied,
      (value) => {
        if (value) {
          Message.success(i18n.global.t('copied'))
        }
      },
      { immediate: true }
    )
  }

  watch(
    () => props.data,
    () => {
      expandedCells.value = {}
      allExpanded.value = false
    },
    { deep: true }
  )

  onUpdated(() => {
    pagination.value.total = props.data?.records.rows.length
  })
</script>

<style lang="less" scoped>
  .cell-wrapper {
    position: relative;
    width: 100%;
    cursor: default;

    &.expandable-cell {
      cursor: pointer;
    }
  }

  .cell-content {
    position: relative;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    word-break: normal;
    transition: max-height 0.3s ease-out, white-space 0.3s ease-out;
    padding: 4px 0;

    &.expanded {
      max-height: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    &.wrap-lines {
      white-space: pre-wrap;
      word-break: break-word;
    }
  }

  .cell-copy-button {
    position: absolute;
    bottom: 2px;
    right: 2px;
    top: auto;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    z-index: 10;
    pointer-events: auto;
    cursor: pointer;
    transition: all 0.1s ease;

    svg {
      width: 12px;
      height: 12px;
      color: white;
    }

    &:hover {
      width: 20px;
      height: 20px;
      transform: scale(1.15);
      transition: transform 0.1s ease;
    }
  }

  .cell-data {
    white-space: pre-wrap;
    margin-bottom: 0;
    color: var(--small-font-color);
  }

  .toolbar {
    padding: 0 8px;
    height: v-bind(toolbarHeight);
    width: 100%;
    justify-content: flex-end;
    align-items: flex-start;

    .arco-checkbox {
      font-size: 11px;
    }
  }

  .icon-14 {
    width: 14px;
    height: 14px;
  }

  :deep(.arco-spin.table-spin) {
    width: 100%;
    height: calc(100% - v-bind(toolbarHeight)) !important;
  }
</style>
