<template lang="pug">
a-card(:bordered="false")
  template(#title)
    a-space(size="mini")
      svg.icon-20
        use(href="#table")
      | {{$t('dataExplorer.table')}}
  a-spin(style='width: 100%')
    a-table(:columns='gridColumn', :data='gridData', :pagination='pagination')
</template>

<script lang="ts" setup>
  import { useCodeRunStore } from '@/store'

  const { currentResult } = storeToRefs(useCodeRunStore())

  const pagination = {
    'total': currentResult.value.records.rows.length,
    'show-page-size': true,
  }

  const gridColumn = computed(() => {
    const { schema } = currentResult.value.records
    if (!schema) return []
    return schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name.replace(/\./gi, '-'),
      }
    })
  })

  const gridData = computed(() => {
    return currentResult.value.records.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        const columnName = currentResult.value.records.schema.column_schemas[index].name.replace(/\./gi, '-')
        tempRow[columnName] = item
      })
      return tempRow
    })
  })
</script>
