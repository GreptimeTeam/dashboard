<template lang="pug">
a-card(:bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-20
        use(href="#table")
      | {{ $t('dataExplorer.table') }}
  a-spin(style="width: 100%")
    a-table(:data="gridData" :pagination="pagination")
      template(#columns)
        template(v-for="column in gridColumns" :key="column.title")
          template(v-if="timeColumnNames.includes(column.title)")
            a-table-column(
              :data-index="timeColumnFormatMap[column.dataIndex] ? `${column.dataIndex}${formatSuffix}` : column.dataIndex"
              :width="timeColumnWidth"
            )
              template(#title)
                a-tooltip(
                  placement="top"
                  :content="timeColumnFormatMap[column.dataIndex] ? $t('dataExplorer.showTimestamp') : $t('dataExplorer.formatTimestamp')"
                )
                  a-space(
                    size="mini"
                    :style="{ cursor: 'pointer' }"
                    @click="() => handleFormatTimeColumn(column.dataIndex)"
                  )
                    svg.icon-20
                      use(href="#time-index")
                    | {{ column.title }}
          template(v-else)
            a-table-column(:title="column.title" :data-index="column.dataIndex")
</template>

<script lang="ts" setup>
  import { dateTypes } from '@/views/dashboard/config'

  const props = defineProps({
    data: {
      type: Object,
      default: () => ({}),
    },
    hasHeader: {
      type: Boolean,
      default: true,
    },
  })

  const pagination = {
    'total': props.data?.records.rows.length,
    'show-page-size': true,
  }

  // replace '.' with '-' to make it a valid data-index
  // useful when '.' is used in column name, such as `SELECT 1.1`, `SELECT 1 AS a.b`
  function columnNameToDataIndex(columnName: string) {
    return columnName.replace(/\./gi, '-')
  }

  const timeColumnNames = computed(() => {
    return props.data.records.schema.column_schemas
      .filter((column: any) => dateTypes.includes(column.data_type))
      .map((column: any) => column.name)
  })

  const gridColumns = computed(() => {
    const { schema } = props.data.records
    if (!schema) return []

    // use sort to make time columns display on the left first
    return schema.column_schemas
      .map((column: any) => {
        return {
          title: column.name,
          dataIndex: columnNameToDataIndex(column.name),
        }
      })
      .sort((a: any, b: any) => {
        if (timeColumnNames.value.includes(a.title)) {
          return -1
        }
        return 0
      })
  })

  // use ref to make it mutable
  const gridData = ref(
    (() => {
      return props.data.records.rows.map((row: any) => {
        const tempRow: any = {}
        row.forEach((item: any, index: number) => {
          const columnName = columnNameToDataIndex(props.data.records.schema.column_schemas[index].name)
          tempRow[columnName] = item
        })
        return tempRow
      })
    })()
  )

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

  function formatTimestamp(timestamp: number) {
    return new Date(timestamp).toLocaleString()
  }

  const handleFormatTimeColumn = (dataIndex: string) => {
    timeColumnFormatMap.value[dataIndex] = !timeColumnFormatMap.value[dataIndex]
    // calculate formatted time data on first access
    if (gridData.value.length && !gridData.value[0][`${dataIndex}${formatSuffix}`]) {
      gridData.value.forEach((row: any) => {
        row[`${dataIndex}${formatSuffix}`] = formatTimestamp(row[dataIndex])
      })
    }
  }

  /** use a fixed width for the time column to prevent the width from changing automatically after formatting  */
  const timeColumnWidth = 180
</script>
