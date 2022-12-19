<template lang="pug">
a-spin(style="width: 100%")
  a-table(:columns="gridColumn" :data="gridData")
</template>

<script lang="ts" setup>
  const { currentResult } = storeToRefs(useCodeRunStore())

  const gridColumn = computed(() => {
    return currentResult.value.records.schema.column_schemas.map((column: any) => {
      return {
        title: column.name,
        dataIndex: column.name,
        align: 'right',
      }
    })
  })

  const gridData = computed(() => {
    return currentResult.value.records.rows.map((row: any) => {
      const tempRow: any = {}
      row.forEach((item: any, index: number) => {
        tempRow[currentResult.value.records.schema.column_schemas[index].name] = item
      })
      return tempRow
    })
  })
</script>
