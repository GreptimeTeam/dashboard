<template lang="pug">
a-button(size="small" type="text" @click="exportSql")
  | Export as CSV
</template>

<script setup name="ExportLog" lang="ts">
  import fileDownload from 'js-file-download'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { getWhereClause, parseOrderBy } from './until'

  const { editingSql, columns, tsColumn, inputTableName } = storeToRefs(useLogsQueryStore())

  function getExportSql() {
    let fields = []
    if (tsColumn.value) {
      fields.push(tsColumn.value.name)
    }
    fields = [...fields, ...columns.value.map((column) => column.name).filter((v) => v !== tsColumn?.value.name)]
    let where = getWhereClause(editingSql.value)
    if (where) {
      where = `WHERE ${where}`
    }
    const order = parseOrderBy(editingSql.value) || 'desc'
    const limit = 10000
    return `SELECT ${fields.join(', ')} FROM ${inputTableName.value} ${where} ORDER BY ${
      tsColumn.value.name
    } ${order} LIMIT ${limit}`
  }

  function exportSql() {
    if (!inputTableName.value) {
      return
    }
    const sql = getExportSql()
    editorAPI.runSQLWithCSV(sql).then((result) => {
      fileDownload(result as unknown as string, `${inputTableName.value}.csv`)
    })
  }
</script>

<style scoped lang="less"></style>
