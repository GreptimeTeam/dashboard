<template lang="pug">
a-button(size="small" type="text" @click="exportSql")
  | Export as CSV
</template>

<script setup name="ExportLog" lang="ts">
  import fileDownload from 'js-file-download'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { getWhereClause, parseOrderBy } from './until'

  const props = defineProps({
    columns: Array,
    tsColumn: Object,
  })

  const { editorSql, currentTableName } = storeToRefs(useLogsQueryStore())

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
        const where = getWhereClause(editorSql.value)
        const order = parseOrderBy(editorSql.value) || 'desc'
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
