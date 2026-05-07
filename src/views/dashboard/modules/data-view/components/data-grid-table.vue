<template lang="pug">
a-card.data-grid(:bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-20
        use(href="#table")
      span {{ $t('dashboard.table') }}
  DataGridToolbar(:wrap-lines="wrapLines" @change="handleWrapLineChange")
  .table-container
    DataTable(
      :data="pagedData"
      :columns="gridColumns"
      :size="'mini'"
      :displayed-columns="displayedColumns"
      :column-mode="'separate'"
      :ts-column="tsColumn"
      :show-context-menu="false"
      :wrap-line="wrapLines"
    )
  DataGridPagination(
    :total="gridData.length"
    :current="currentPage"
    :page-size="pageSize"
    @update:current="(value) => (currentPage = value)"
    @update:page-size="handlePageSizeChange"
  )
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { dateTypes, numberTypes } from '@/views/dashboard/config'
  import type { ResultType, SchemaType } from '@/store/modules/code-run/types'
  import type { ColumnType } from '@/types/query'
  import DataTable from '@/components/data-table/index.vue'
  import DataGridToolbar from './data-grid-toolbar.vue'
  import DataGridPagination from './data-grid-pagination.vue'

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
  const currentPage = ref(1)
  const pageSize = ref(20)

  function columnNameToDataIndex(columnName: string) {
    return columnName.replace(/\./gi, '-')
  }

  const timeColumnNames = computed(() => {
    const schema = props.data?.records?.schema
    if (!schema) return []
    return schema.column_schemas
      .filter((column: SchemaType) => dateTypes.includes(column.data_type))
      .map((column: SchemaType) => column.name)
  })

  const gridColumns = computed<ColumnType[]>(() => {
    const schema = props.data?.records?.schema
    if (!schema) return []
    return schema.column_schemas
      .map((column: SchemaType) => {
        return {
          name: columnNameToDataIndex(column.name),
          title: column.name,
          data_type: column.data_type,
          semantic_type: '',
        } as ColumnType
      })
      .sort((a, b) => {
        return +timeColumnNames.value.includes(b.title || b.name) - +timeColumnNames.value.includes(a.title || a.name)
      })
  })

  const displayedColumns = computed(() => gridColumns.value.map((column) => column.name))

  const tsColumn = computed<ColumnType | null>(() => {
    const timeColumn = gridColumns.value.find((column) => dateTypes.includes(column.data_type))
    return timeColumn || null
  })

  const gridData = computed(() => {
    const schema = props.data?.records?.schema
    if (!schema) return []

    return props.data.records.rows.map((row: any) => {
      const tempRow: Record<string, unknown> = {}
      row.forEach((item: any, index: number) => {
        const rawColumnName = schema.column_schemas[index].name
        const columnName = columnNameToDataIndex(rawColumnName)
        const type = schema.column_schemas[index].data_type

        if (numberTypes.includes(type) && typeof item === 'string') {
          if (type !== 'Int64' && type !== 'UInt64' && type !== 'Float64') {
            item = Number(item)
          }
        }
        tempRow[columnName] = item
      })
      return tempRow
    })
  })

  const pagedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return gridData.value.slice(start, start + pageSize.value)
  })

  const handlePageSizeChange = (newSize: number) => {
    pageSize.value = newSize
    currentPage.value = 1
  }

  const handleWrapLineChange = (value: boolean) => {
    wrapLines.value = value
  }

  watch(
    () => props.data,
    () => {
      currentPage.value = 1
    },
    { deep: true }
  )
</script>

<style lang="less" scoped>
  .data-grid {
    height: 100%;
    padding: 2px 8px;

    > :deep(.arco-card-body) {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
  }

  .table-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
