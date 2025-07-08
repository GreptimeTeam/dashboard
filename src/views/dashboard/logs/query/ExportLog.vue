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

  const { editingSql, currentTableName } = storeToRefs(useLogsQueryStore())

  function getExportSql() {
    try {
      let fields = []
      if (props.tsColumn && props.tsColumn.name) {
        fields.push(props.tsColumn.name)
      }
      if (props.columns && Array.isArray(props.columns)) {
        fields = [
          ...fields,
          ...props.columns.map((column) => column?.name).filter((v) => v && v !== props.tsColumn?.name),
        ]
      }
      let where = getWhereClause(editingSql.value)
      if (where) {
        where = `WHERE ${where}`
      }
      const order = parseOrderBy(editingSql.value) || 'desc'
      const limit = 10000
      return `SELECT ${fields.join(', ')} FROM ${currentTableName.value} ${where} ORDER BY ${
        props.tsColumn?.name || 'id'
      } ${order} LIMIT ${limit}`
    } catch (error) {
      return `SELECT * FROM ${currentTableName.value} LIMIT 10000`
    }
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
