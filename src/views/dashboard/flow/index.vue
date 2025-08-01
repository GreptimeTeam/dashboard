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
        a-button(size="small" @click="showCreate") Create Flow
      DataTable(
        :data="data"
        :columns="columns"
        :loading="loading"
        :show-context-menu="false"
      )
        template(#column-operate="{ record }")
          a-space
            a-button(size="small" @click="showEdit(record)") Edit
            a-popconfirm(content="Confirm to delete?" @ok="del(record)")
              a-button(size="small" status="danger") Delete

    FlowDetailModal(
      :key="editData?.flow_name"
      v-model:visible="modalVisible"
      :is-edit="isEdit"
      :edit-data="editData"
      @saved="handleFlowSaved"
    )
</template>

<script setup name="FlowList" lang="ts">
  import type { TableColumnData } from '@arco-design/web-vue'
  import { Message } from '@arco-design/web-vue'
  import editorAPI from '@/api/editor'
  import DataTable from '@/components/data-table/index.vue'
  import FlowDetailModal from './components/FlowDetailModal.vue'
  import { toObj } from '../logs/query/until'

  // Define the desired column order
  const displayedColumns = [
    'flow_name',
    'sink_table_name',
    'source_table_names',
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

  // Modal state
  const modalVisible = ref(false)
  const isEdit = ref(false)
  const editData = ref(null)

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

        data.value = result.output[0].records.rows.map((row, index) => {
          const obj = toObj(row, schemas, index, null)
          // Convert expire_after to seconds if it is Int64
          const expireAfterSchema = schemas.filter((v) => v.name === 'expire_after')
          if (expireAfterSchema[0].data_type === 'Int64' && obj.expire_after !== null) {
            obj.expire_after = `${obj.expire_after} s`
          }
          return obj
        })

        // Update total results count
        totalResults.value = data.value.length

        loading.value = false
      })
      .catch((error) => {
        console.error('Failed to load flows:', error)
        loading.value = false
        totalResults.value = 0
        Message.error('Failed to load flows list')
      })
  }

  // Initial load
  list()

  function handleFlowSaved(eventData: { success: boolean; message?: string; mode: string }) {
    const { success, message } = eventData
    if (success) {
      // Show success message
      if (message) {
        Message.success(message)
      }
      // Always refresh the flow list after successful save
      list()
    } else if (message) {
      // Show error message
      Message.error(message)
    }
  }

  function showCreate() {
    isEdit.value = false
    editData.value = null
    modalVisible.value = true
  }

  function showEdit(record) {
    isEdit.value = true
    editData.value = record
    modalVisible.value = true
  }

  function del(record) {
    editorAPI
      .runSQL(`DROP FLOW IF EXISTS ${record.flow_name}`)
      .then((result) => {
        Message.success('Flow deleted successfully')
        list()
      })
      .catch((error) => {
        console.error('Delete flow failed:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        Message.error(`Delete flow failed: ${errorMessage}`)
      })
  }
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';
</style>

<style scoped lang="less">
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
