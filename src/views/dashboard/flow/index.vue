<template lang="pug">
.query-layout.flow-page.query-container
  .page-header.flow-page-header
    .page-header-main
      | Flow
      span.page-header-subtitle
        | Real-time computation of data streams.
        a.flow-page-learn-more(
          href="https://docs.greptime.com/user-guide/flow-computation/overview"
          target="_blank"
          rel="noopener noreferrer"
        )
          | Learn more
          svg.icon-12
            use(href="#import")
    a-button.flow-new-btn(type="primary" @click="showCreate")
      template(#icon)
        icon-plus
      | New Flow

  .content-wrapper.query-layout-cards
    a-card.flow-results-card(:bordered="false")
      template(#title)
        .flow-results-header
          span.flow-results-title {{ $t('logsQuery.results') }}
          span.flow-results-badge(v-if="totalResults > 0") {{ totalResults }}
      DataTable.flow-table(
        :data="data"
        :columns="columns"
        :loading="loading"
        :show-context-menu="false"
        :scroll="flowTableScroll"
      )
        template(#column-flow_name="{ record }")
          span.flow-name-cell {{ record.flow_name }}
        template(#column-sink_table_name="{ record }")
          span.flow-sink-cell {{ record.sink_table_name || '—' }}
        template(#column-source_table_names="{ record }")
          span {{ record.source_table_names || '—' }}
        template(#column-comment="{ record }")
          span {{ record.comment || '—' }}
        template(#column-status="{ record }")
          span.flow-status-tag(v-if="record.status" :class="getStatusClass(record.status)")
            span.flow-status-dot
            | {{ record.status }}
          span(v-else) —
        template(#column-created_time="{ record }")
          .flow-time-cell
            svg.icon-12.flow-time-icon
              use(href="#time")
            span {{ record.created_time || '—' }}
        template(#column-updated_time="{ record }")
          .flow-time-cell
            svg.icon-12.flow-time-icon
              use(href="#time")
            span {{ record.updated_time || '—' }}
        template(#column-operate="{ record }")
          a-space.flow-actions(:size="8")
            a-button.flow-action-btn(size="small" @click="showEdit(record)") Edit
            a-popconfirm(content="Confirm deletion?" type="warning" @ok="del(record)")
              a-button.flow-action-btn(size="small" status="danger") Delete

    FlowDetailModal(
      :key="editData?.flow_id"
      v-model:visible="modalVisible"
      :edit-data="editData"
      :raw-data="textEditorData"
      :schema-columns="schemaColumns"
      @saved="handleFlowSaved"
      @clone="handleClone"
    )
</template>

<script setup name="FlowList" lang="ts">
  import { Message } from '@arco-design/web-vue'
  import type { ColumnType } from '@/types/query'
  import editorAPI from '@/api/editor'
  import DataTable from '@/components/data-table/index.vue'
  import FlowDetailModal from './components/flow-detail-modal.vue'
  import { toObj } from '../logs/query/until'

  const displayedColumns = [
    'flow_name',
    'sink_table_name',
    'source_table_names',
    'comment',
    'status',
    'created_time',
    'updated_time',
    'operate',
  ]

  const columns = shallowRef<Array<ColumnType>>([])
  const data = shallowRef<Array<any>>([])
  const loading = ref(false)
  const totalResults = ref(0)
  const modalVisible = ref(false)
  const isEdit = ref(false)
  const editData = ref(null)
  const textEditorData = ref('')
  const schemaColumns = shallowRef<Array<ColumnType>>([])

  /** 不按父级撑满，表格高度随数据行数 */
  const flowTableScroll = { y: undefined }

  const getStatusClass = (status: unknown) => {
    const value = String(status ?? '').toLowerCase()
    if (['running', 'active', 'started'].includes(value)) return 'is-running'
    if (['error', 'failed', 'stopped', 'stop'].includes(value)) return 'is-error'
    return 'is-default'
  }

  function list() {
    loading.value = true
    editorAPI
      .runSQL('select * from  INFORMATION_SCHEMA.FLOWS order by created_time desc')
      .then((result) => {
        const schemas = result.output[0].records.schema.column_schemas

        schemaColumns.value = schemas.map((v) => ({
          name: v.name,
          title: v.name,
          data_type: v.data_type,
        }))

        const operateColumn = {
          name: 'operate',
          title: 'Actions',
          data_type: 'string',
        }

        const allColumns = [...schemaColumns.value, operateColumn]

        columns.value = displayedColumns
          .map((columnName) => allColumns.find((col) => col.name === columnName))
          .filter(Boolean) as ColumnType[]

        data.value = result.output[0].records.rows.map((row, index) => {
          const obj = toObj(row, schemas, index, null)
          const expireAfterSchema = schemas.filter((v) => v.name === 'expire_after')
          if (expireAfterSchema[0]?.data_type === 'Int64' && obj.expire_after !== null) {
            obj.expire_after = `'${obj.expire_after} s'`
          }
          return obj
        })

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

  list()

  function handleFlowSaved(eventData: { success: boolean; message?: string; mode: string }) {
    const { success, message } = eventData
    if (success) {
      if (message) {
        Message.success(message)
      }
      list()
    } else if (message) {
      Message.error(message)
    }
  }

  function showCreate() {
    isEdit.value = false
    editData.value = null
    textEditorData.value = ''
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
      .then(() => {
        Message.success('Flow deleted successfully')
        list()
      })
      .catch((error) => {
        console.error('Delete flow failed:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        Message.error(`Delete flow failed: ${errorMessage}`)
      })
  }

  function handleClone(cloneData: any) {
    editData.value = cloneData.formData
    textEditorData.value = cloneData.rawData
  }
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';
</style>

<style scoped lang="less">
  .flow-page {
    height: auto;
    min-height: 100%;
    overflow: visible;
    background: var(--gpt-bg-app);

    &.query-container {
      height: auto;
      min-height: calc(100vh - var(--footer-height));
      overflow: visible;
    }

    .content-wrapper {
      flex: 0 0 auto;
      overflow: visible;
    }

    &.query-layout-cards .flow-results-card {
      flex: none;
      height: auto;

      :deep(.arco-card-body) {
        flex: none;
        height: auto;
        min-height: 0;
      }
    }
  }

  .flow-page-header {
    justify-content: space-between;
    gap: 16px;
  }

  .page-header-main {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .page-header-subtitle {
    font-family: var(--font-family-base);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--gpt-text-secondary);
  }

  .flow-page-learn-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    font-weight: 500;
  }

  .flow-new-btn {
    flex-shrink: 0;
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-brand-900);
    color: #fff;
    font-size: 12px;
    font-weight: 600;

    &:hover {
      opacity: 0.92;
      color: #fff;
    }
  }

  .content-wrapper {
    padding: var(--gpt-page-padding-y) var(--gpt-page-padding-x);
  }

  .flow-results-card {
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: 0 1px 4px rgba(71, 52, 96, 0.06);
    overflow: hidden;

    :deep(.arco-card-header) {
      min-height: 44px;
      background: var(--gpt-bg-panel);
      border-bottom: 1px solid var(--gpt-border-default);
    }

    :deep(.arco-card-body) {
      padding: 0;
    }

    :deep(.arco-card-header-title) {
      font-weight: 600;
    }
  }

  .flow-results-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .flow-results-title {
    color: var(--gpt-text-primary);
    font-size: 13px;
    font-weight: 700;
  }

  .flow-results-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    border-radius: 10px;
    background: var(--gpt-bg-app);
    color: var(--gpt-text-secondary);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }

  .flow-table {
    :deep(.data-table-container) {
      height: auto;
      overflow: visible;
    }

    :deep(.arco-table-container),
    :deep(.arco-table-wrapper),
    :deep(.arco-table-body) {
      height: auto !important;
    }

    :deep(.arco-table-th) {
      background: var(--gpt-table-head-bg);
      color: var(--gpt-text-secondary);
      font-size: 12px;
      font-weight: 600;
    }

    :deep(.arco-table-td) {
      font-size: 12px;
      color: var(--gpt-text-primary);
    }

    :deep(.arco-table-tr:hover .arco-table-td) {
      background: var(--gpt-nav-active-bg);
    }
  }

  .flow-name-cell {
    font-weight: 700;
    color: var(--gpt-text-primary);
  }

  .flow-sink-cell {
    color: var(--gpt-brand-600);
    font-weight: 600;
  }

  .flow-time-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--gpt-text-primary);
  }

  .flow-time-icon {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    fill: currentColor;
  }

  .flow-status-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    text-transform: capitalize;

    &.is-running {
      background: rgba(0, 187, 178, 0.12);
      color: var(--gpt-accent-ts);
    }

    &.is-error {
      background: rgba(245, 63, 63, 0.1);
      color: var(--danger-color, #f53f3f);
    }

    &.is-default {
      background: var(--gpt-bg-app);
      color: var(--gpt-text-secondary);
    }
  }

  .flow-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .flow-actions {
    :deep(.flow-action-btn) {
      height: 24px;
      padding: 0 4px;
      font-size: 12px;
      font-weight: 500;
    }
  }
</style>
