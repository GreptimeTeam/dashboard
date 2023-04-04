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
        template(v-for='schema in gridColumns', :key='schema.name')
          template(v-if='timeColumnNames.includes(schema.title)')
            a-table-column(
              :title='generateTimeColumnHeader(schema.title)',
              :data-index='timeColumnFormatMap[schema.title] ? `${schema.title}${formatSuffix}` : schema.title'
            )
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

  const formatSuffix = '--FORMATTED'

  const gridData = computed(() => {
    return currentResult.value.records.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        const columnName = currentResult.value.records.schema.column_schemas[index].name.replace(/\./gi, '-')
        tempRow[columnName] = item
      })

      // pre-calculated formatted time column data
      timeColumnNames.value.forEach((columnName) => {
        tempRow[`${columnName}${formatSuffix}`] = new Date(tempRow[columnName]).toLocaleString()
      })
      return tempRow
    })
  })

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

  // return any because a-table-column's title prop was defined to be a string, although it also accepts a component
  const generateTimeColumnHeader = computed(() => (title: string): any => {
    return h('span', null, [
      h(
        Tooltip,
        {
          content: 'Format time',
          placement: 'top',
        },
        {
          default: () =>
            h(IconHistory, {
              style: {
                marginRight: '5px',
                cursor: 'pointer',
              },
              onClick: () => {
                timeColumnFormatMap.value[title] = !timeColumnFormatMap.value[title]
              },
            }),
        }
      ),
      h('span', null, title),
    ])
  })

  // /**
  //  *
  //  */
  // const handleformatTimeColumn = (comulnName: string) => {
  //   const { schema } = currentResult.value.records
  //   if (!schema) return []
  //   const columnSchema = schema.column_schemas.find((column: any) => column.name === comulnName)
  //   if (!columnSchema) return []
  //   return columnSchema.data_type === 'timestamp' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'
  // }
</script>
