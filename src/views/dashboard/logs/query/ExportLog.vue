<template lang="pug">
a-button(size="small" type="text" @click="exportSql")
  | Export as csv
</template>

<script setup name="ExportLog" lang="ts">
  import fileDownload from 'js-file-download'
  import editorAPI from '@/api/editor'
  import useLogQueryStore from '@/store/modules/logquery'
  import { getWhereClause, parseOrderBy } from './until'

  const { editingSql, columns, tsColumn, inputTableName } = storeToRefs(useLogQueryStore())

  function getExportSql() {
    let fields = []
    if (tsColumn.value) {
      fields.push(tsColumn.value.name)
    }
    fields = [...fields, ...columns.value.map((column) => column.name).filter((v) => v !== tsColumn?.value.name)]
    const where = getWhereClause(editingSql.value)
    const order = parseOrderBy(editingSql.value) || 'desc'
    return `SELECT ${fields.join(', ')} FROM ${inputTableName.value} WHERE ${where} ORDER BY ${
      tsColumn.value.name
    } ${order}`
  }

  function exportSql() {
    if (!inputTableName.value) {
      return
    }
    const sql = getExportSql()
    editorAPI.runSQLWithCSV(sql).then((result) => {
      fileDownload(result as unknown as string, `${inputTableName.value}_log.csv}`)
    })
  }
</script>

<style scoped lang="less"></style>
