<template lang="pug">
.query-layout.flow-query-container.query-container
  .page-header
    | Flows
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      template(#title)
        .results-header
          span Results
          span.results-count(v-if="totalResults > 0") 
            | ({{ totalResults }} {{ totalResults === 1 ? 'record' : 'records' }})
      template(#extra)
        a-button(size="small" @click="showCreate") Create
      DataTable(
        :data="data"
        :columns="columns"
        :loading="loading"
        :show-context-menu="false"
      )
        template(#column-operate="{ record }")
          a-popconfirm(content="Confirm to delete?" @ok="del(record)")
            a-button(size="small") Delete
    a-drawer(
      v-if="form"
      v-model:visible="addVisible"
      title="Flow Create"
      ok-text="Close"
      :width="800"
      :mask="false"
      :hide-cancel="true"
    )
      a-form(layout="vertical" :model="form" @submit="create")
        a-form-item(field="content" label="Content")
          YmlEditor(v-model="form.content" language="sql" style="width: 100%; height: 500px")
        a-form-item
          a-button(html-type="submit" type="primary") Submit
</template>

<script setup name="FlowList" lang="ts">
  import type { TableColumnData } from '@arco-design/web-vue'
  import editorAPI from '@/api/editor'
  import YmlEditor from '@/components/yml-editor.vue'
  import DataTable from '@/components/data-table/index.vue'
  import { toObj } from '../logs/query/until'

  // Define the desired column order
  const displayedColumns = [
    'flow_name',
    'flow_type',
    'flow_id',
    'source_table_names',
    'sink_table_name',
    'comment',
    'created_time',
    'updated_time',
    'operate',
  ]

  const columns = shallowRef<Array<TableColumnData>>([])
  const data = shallowRef<Array<any>>([])
  const loading = ref(false)

  // Results header state
  const totalResults = ref(0)

  function list() {
    loading.value = true
    editorAPI
      .runSQL('select * from  INFORMATION_SCHEMA.FLOWS')
      .then((result) => {
        const schemas = result.output[0].records.schema.column_schemas

        // Build all available columns from schema
        const schemaColumns = schemas.map((v) => ({
          name: v.name,
          title: v.name,
          data_type: v.data_type,
          dataIndex: v.name,
        }))

        // Add the operate column
        const operateColumn = {
          name: 'operate',
          title: 'Operate',
          data_type: 'string',
          dataIndex: 'operate',
        }

        // Combine all columns
        const allColumns = [...schemaColumns, operateColumn]

        // Filter and order columns based on displayedColumns array
        columns.value = displayedColumns
          .map((columnName) => allColumns.find((col) => col.name === columnName))
          .filter(Boolean) // Remove undefined columns

        data.value = result.output[0].records.rows.map((row, index) => toObj(row, schemas, index, null))

        // Update total results count
        totalResults.value = data.value.length

        console.log(data.value, columns.value)
        loading.value = false
      })
      .catch(() => {
        loading.value = false
        totalResults.value = 0
      })
  }
  list()

  const addVisible = ref(false)
  const form = reactive({ content: '' })

  function showCreate() {
    addVisible.value = true
  }

  function create() {
    editorAPI.runSQL(form.content).then((result) => {
      list()
      addVisible.value = false
    })
  }

  function del(record) {
    editorAPI.runSQL(`DROP FLOW IF EXISTS ${record.flow_name}`).then((result) => {
      list()
    })
  }
</script>

<style scoped lang="less">
  @import '@/assets/style/query-layout.less';

  .results-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .results-count {
      color: var(--color-text-3);
      font-size: 12px;
      font-weight: normal;
    }
  }
</style>
