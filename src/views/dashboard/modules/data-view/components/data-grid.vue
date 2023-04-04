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
  import { Tooltip } from '@arco-design/web-vue'
  import { IconHistory } from '@arco-design/web-vue/es/icon'

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

  const timeColumnNames = computed(() => {
    return currentResult.value.records.schema.column_schemas
      .filter((column) => dateTypes.includes(column.data_type))
      .map((column) => column.name)
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

  /**
   * use extra state to store the formatted time column data
   */
  const timeColumnFormatMap = ref(
    Object.fromEntries(
      timeColumnNames.value.map((columnName) => {
        return [columnName, false]
      })
    )
  )

  const formatSuffix = '--FORMATTED'

  const handleFormatTimeColumn = (title: string) => {
    timeColumnFormatMap.value[title] = !timeColumnFormatMap.value[title]
    // calculate formatted time data at first access
    if (!gridData.value[0]?.[`${title}${formatSuffix}`]) {
      gridData.value.forEach((row: any) => {
        row[`${title}${formatSuffix}`] = new Date(row[title]).toLocaleString()
      })
    }
  }
</script>
