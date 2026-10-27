<template lang="pug">
.query-layout.query-layout--surface.flow-page.query-container
  .page-header.gpt-page-header.flow-page-header
    .page-header-main
      | {{ $t('menu.dashboard.flow') }}
      span.page-header-subtitle.gpt-text-page-subtitle
        | {{ $t('flow.subtitle') }}
        a.flow-page-learn-more(
          href="https://docs.greptime.com/user-guide/flow-computation/overview"
          target="_blank"
          rel="noopener noreferrer"
        )
          | {{ $t('flow.learnMore') }}
          svg.icon-12
            use(href="#import")
    a-button(type="primary" size="medium" @click="showCreate")
      template(#icon)
        icon-plus
      | {{ $t('flow.new') }}

  .content-wrapper.query-layout-cards
    a-card.flow-results-card.gpt-surface-card(:bordered="false")
      template(#title)
        span.gpt-surface-card__title {{ $t('logsQuery.results') }}
        span.gpt-surface-card__badge(v-if="totalResults > 0") {{ totalResults }}
      .flow-filter-toolbar.gpt-results-toolbar
        a-space.flow-filter-controls(:size="12")
          a-input.flow-filter-search(
            v-model="searchKeyword"
            size="small"
            allow-clear
            :style="{ width: '240px' }"
            :placeholder="$t('flow.filterSearchPlaceholder')"
          )
            template(#prefix)
              svg.icon-12.icon-color
                use(href="#search")
          a-select.flow-filter-select(
            v-model="sourceTableFilter"
            size="small"
            allow-clear
            allow-search
            :style="{ width: '240px' }"
            :placeholder="$t('flow.filterSourcePlaceholder')"
            :options="sourceTableOptions"
          )
          a-select.flow-filter-select(
            v-model="sinkTableFilter"
            size="small"
            allow-clear
            allow-search
            :style="{ width: '240px' }"
            :placeholder="$t('flow.filterSinkPlaceholder')"
            :options="sinkTableOptions"
          )
      DataTable.flow-table.gpt-table-page(
        leftover-strategy="proportional"
        :data="filteredFlows"
        :columns="columns"
        :loading="loading"
        :show-context-menu="false"
        :scroll="flowTableScroll"
      )
        template(#column-status="{ record }")
          span.gpt-status-pill(v-if="record.status" :class="getStatusClass(record.status)")
            span.gpt-status-pill__dot
            | {{ record.status }}
          span(v-else) —
        template(#column-operate="{ record }")
          a-space(:size="8")
            a-button(size="small" @click="showEdit(record)") {{ $t('common.edit') }}
            a-popconfirm(type="warning" :content="$t('common.deleteConfirm')" @ok="del(record)")
              a-button(size="small" status="danger") {{ $t('common.delete') }}

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
  import { useI18n } from 'vue-i18n'
  import type { ColumnType } from '@/types/query'
  import editorAPI from '@/api/editor'
  import DataTable from '@/components/data-table/index.vue'
  import FlowDetailModal from './components/flow-detail-modal.vue'
  import { toObj } from '../logs/query/until'

  const { t } = useI18n()

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
  const allFlows = shallowRef<Array<any>>([])
  const loading = ref(false)
  const modalVisible = ref(false)
  const isEdit = ref(false)
  const editData = ref(null)
  const textEditorData = ref('')
  const schemaColumns = shallowRef<Array<ColumnType>>([])

  const searchKeyword = ref('')
  const sourceTableFilter = ref<string | undefined>()
  const sinkTableFilter = ref<string | undefined>()

  /** 不按父级撑满，表格高度随数据行数 */
  const flowTableScroll = { y: undefined }

  const splitSourceTables = (value: unknown): string[] =>
    String(value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

  /** Hide catalog: greptime.public.t → public.t */
  const toDbTableName = (qualifiedName: string): string => {
    const parts = qualifiedName.split('.').filter(Boolean)
    if (parts.length >= 3) return parts.slice(-2).join('.')
    return qualifiedName
  }

  const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

  const sourceTableOptions = computed(() =>
    uniqueSorted(allFlows.value.flatMap((flow) => splitSourceTables(flow.source_table_names).map(toDbTableName))).map(
      (value) => ({
        label: value,
        value,
      })
    )
  )

  const sinkTableOptions = computed(() =>
    uniqueSorted(
      allFlows.value
        .map((flow) => String(flow.sink_table_name ?? '').trim())
        .filter(Boolean)
        .map(toDbTableName)
    ).map((value) => ({
      label: value,
      value,
    }))
  )

  const filteredFlows = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    const source = sourceTableFilter.value
    const sink = sinkTableFilter.value

    return allFlows.value.filter((flow) => {
      if (keyword) {
        const haystack = [flow.flow_name, flow.comment, flow.sink_table_name, flow.source_table_names]
          .map((part) => String(part ?? '').toLowerCase())
          .join('\n')
        if (!haystack.includes(keyword)) return false
      }
      if (source && !splitSourceTables(flow.source_table_names).map(toDbTableName).includes(source)) {
        return false
      }
      if (sink && toDbTableName(String(flow.sink_table_name ?? '').trim()) !== sink) return false
      return true
    })
  })

  const totalResults = computed(() => filteredFlows.value.length)

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
          title: t('common.actions'),
          data_type: 'string',
        }

        const allColumns = [...schemaColumns.value, operateColumn]

        columns.value = displayedColumns
          .map((columnName) => {
            const col = allColumns.find((c) => c.name === columnName)
            if (!col) return null
            if (columnName === 'flow_name') {
              return { ...col, cellClass: 'flow-name-cell' }
            }
            if (columnName === 'sink_table_name') {
              return { ...col, cellClass: 'flow-sink-cell' }
            }
            return col
          })
          .filter(Boolean) as ColumnType[]

        allFlows.value = result.output[0].records.rows.map((row, index) => {
          const obj = toObj(row, schemas, index, null)
          const expireAfterSchema = schemas.filter((v) => v.name === 'expire_after')
          if (expireAfterSchema[0]?.data_type === 'Int64' && obj.expire_after !== null) {
            obj.expire_after = `'${obj.expire_after} s'`
          }
          return obj
        })

        loading.value = false
      })
      .catch((error) => {
        console.error('Failed to load flows:', error)
        loading.value = false
        allFlows.value = []
        Message.error(t('flow.loadFailed'))
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

  // Deep-link: ?create=1 opens create modal
  const route = useRoute()
  watch(
    () => route.query.create,
    (val) => {
      if (val === '1') {
        showCreate()
        useRouter().replace({ query: { ...route.query, create: undefined } })
      }
    },
    { immediate: true }
  )

  function showEdit(record) {
    isEdit.value = true
    editData.value = record
    modalVisible.value = true
  }

  function del(record) {
    editorAPI
      .runSQL(`DROP FLOW IF EXISTS ${record.flow_name}`)
      .then(() => {
        Message.success(t('flow.deleted'))
        list()
      })
      .catch((error) => {
        console.error('Delete flow failed:', error)
        const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
        Message.error(t('flow.deleteFailed', { msg: errorMessage }))
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
  }

  .flow-page-header {
    flex-shrink: 0;
    justify-content: space-between;
    gap: var(--gpt-gap-lg);
  }

  .page-header-main {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .flow-page-learn-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    font-weight: 500;
  }

  .flow-filter-toolbar {
    justify-content: flex-start;
  }

  .flow-table {
    :deep(.flow-name-cell .cell-content),
    :deep(.flow-name-cell .arco-table-td-content) {
      font-weight: 700;
      color: var(--gpt-text-primary);
    }

    :deep(.flow-sink-cell .cell-content),
    :deep(.flow-sink-cell .arco-table-td-content) {
      color: var(--gpt-brand-600);
      font-weight: 600;
    }
  }
</style>
