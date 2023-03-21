<template lang="pug">
a-spin(style='width: 100%')
  a-table(:columns='gridColumn', :data='gridData', :pagination='pagination')
</template>

<script lang="ts" setup>
  const props = defineProps({
    data: {
      type: Object,
      default: () => ({}),
    },
  })

  const pagination = {
    'total': props.data.records.rows.length,
    'show-page-size': true,
  }

  const gridColumn = computed(() => {
    return props.data.records.schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name.replace(/\./gi, '-'),
      }
    })
  })

  const gridData = computed(() => {
    return props.data.records.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        const columnName = props.data.records.schema.column_schemas[index].name.replace(/\./gi, '-')
        tempRow[columnName] = item
      })
      return tempRow
    })
  })
</script>
