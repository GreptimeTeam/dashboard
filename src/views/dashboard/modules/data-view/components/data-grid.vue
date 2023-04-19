<template lang="pug">
a-card(:bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-20
        use(href="#table")
      | {{ $t('dataExplorer.table') }}
  a-spin(style="width: 100%")
    a-table(:columns="gridColumn" :data="gridData" :pagination="pagination")
</template>

<script lang="ts" setup>
  import { useCodeRunStore } from '@/store'

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

  const gridColumn = computed(() => {
    const { schema } = props.data.records
    if (!schema) return []
    return schema.column_schemas.map((column: any) => {
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
