<template lang="pug">
a-card(:bordered='false')
  template(#title)
    a-space(size='mini')
      svg.icon-20
        use(href='#table')
      | {{ $t('dataExplorer.table') }}
  a-spin(style='width: 100%')
    a-table(:data='gridData', style='margin-top: 30px')
      template(#columns)
        template(v-for='schema in gridColumns', :key='schema.title', width=300)
          template(v-if='timeColumnNames.includes(schema.title)')
            a-table-column(
              :data-index='timeColumnFormatMap[schema.title] ? `${schema.title}${formatSuffix}` : schema.title'
            )
              template(#title)
                a-tooltip(:content='`format time`', placement='top')
                  a-space(size='mini')
                    svg.icon-15(@click='() => handleFormatTimeColumn(schema.title)')
                      use(href='#history')
                    | {{ schema.title }}
          template(v-else)
            a-table-column(:title='schema.title', :data-index='schema.title')
</template>

<script lang="ts" setup>
  import { useCodeRunStore } from '@/store'
  import { dateTypes } from '@/views/dashboard/config'

  const { currentResult } = storeToRefs(useCodeRunStore())

  const pagination = {
    'total': currentResult.value.records.rows.length,
    'show-page-size': true,
  }

  const gridColumns = computed(() => {
    const { schema } = currentResult.value.records
    if (!schema) return []
    return schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name.replace(/\./gi, '-'),
      }
    })
  })

  // use ref to make it mutable
  const gridData = ref(
    (() => {
      return currentResult.value.records.rows.map((row: any) => {
        const tempRow: any = {}
        row.forEach((item: any, index: number) => {
          const columnName = currentResult.value.records.schema.column_schemas[index].name.replace(/\./gi, '-')
          tempRow[columnName] = item
        })
        return tempRow
      })
    })()
  )

  const timeColumnNames = computed(() => {
    return currentResult.value.records.schema.column_schemas
      .filter((column) => dateTypes.includes(column.data_type))
      .map((column) => column.name)
  })

  /**
   * use extra state to store which time column is formatted
   */
  const timeColumnFormatMap = ref(
    Object.fromEntries(
      timeColumnNames.value.map((columnName) => {
        return [columnName, false]
      })
    )
  )

  const formatSuffix = '--FORMATTED'

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const handleFormatTimeColumn = (columnName: string) => {
    timeColumnFormatMap.value[columnName] = !timeColumnFormatMap.value[columnName]
    // Calculate formatted time data on first access
    if (!gridData.value[0]?.[`${columnName}${formatSuffix}`]) {
      gridData.value.forEach((row: any) => {
        row[`${columnName}${formatSuffix}`] = formatTimestamp(row[columnName])
      })
    }
  }
</script>
