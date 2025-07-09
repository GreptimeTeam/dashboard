<template lang="pug">
a-button(
  type="outline"
  size="small"
  :disabled="!currentTableName"
  @click="exportSql"
)
  template(#icon)
    svg.icon
      use(href="#export")
  | {{ $t('dashboard.exportCSV') }}
</template>

<script setup name="ExportLog" lang="ts">
  import { storeToRefs } from 'pinia'
  import fileDownload from 'js-file-download'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { getWhereClause, parseOrderBy } from './until'

  interface TSColumn {
    name: string
    multiple?: number
  }

  interface Column {
    name: string
    data_type: string
  }

  const props = defineProps<{
    columns: Column[]
    tsColumn: TSColumn | null
  }>()

  const { sql, currentTableName } = storeToRefs(useLogsQueryStore())

  function getExportSql() {
    if (props.columns && props.columns.length > 0) {
      try {
        let fields = []
        if (props.tsColumn && props.tsColumn.name) {
          fields.push(props.tsColumn.name)
        }
        fields = [
          ...fields,
          ...props.columns.map((column) => column?.name).filter((v) => v && v !== props.tsColumn?.name),
        ]
        const where = getWhereClause(sql.value)
        const order = parseOrderBy(sql.value) || 'desc'
        const limit = 10000
        return `SELECT ${fields.join(', ')} FROM ${currentTableName.value} ${where} ORDER BY ${
          props.tsColumn?.name || 'id'
        } ${order} LIMIT ${limit}`
      } catch (error) {
        return `SELECT * FROM ${currentTableName.value} LIMIT 10000`
      }
    }
    return `SELECT * FROM ${currentTableName.value} LIMIT 10000`
  }

  function exportSql() {
    if (!currentTableName.value) {
      return
    }
    const sql = getExportSql()
    editorAPI.runSQLWithCSV(sql).then((result) => {
      fileDownload(result as unknown as string, `${currentTableName.value}.csv`)
    })
  }
</script>

<style scoped lang="less"></style>
