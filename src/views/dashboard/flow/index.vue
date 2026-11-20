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
      DataGrid.flow-table.gpt-table-page(
        leftover-strategy="last-column"
        :fill-height="false"
        :fit-container="true"
        :pagination="true"
        :data="filteredFlows"
        :columns="columns"
        :loading="loading"
        :show-context-menu="false"
      )
        template(#column-flow_name="{ record }")
          button.flow-name-link(type="button" @click="showEdit(record)") {{ record.flow_name }}
        template(#column-operate="{ record }")
          a-space(:size="8")
            a-button(size="small" @click="showEdit(record)") {{ $t('common.edit') }}
            a-popconfirm(type="warning" :content="$t('common.deleteConfirm')" @ok="del(record)")
              a-button(size="small" status="danger") {{ $t('common.delete') }}

    FlowDetailModal(
      :key="modalInstanceKey"
      v-model:visible="modalVisible"
      :edit-data="editData"
      :schema-columns="schemaColumns"
      @saved="handleFlowSaved"
    )
</template>

<script setup name="FlowList" lang="ts">
  import { Message } from '@arco-design/web-vue'
  import { useI18n } from 'vue-i18n'
  import type { ColumnType } from '@/types/query'
  import editorAPI from '@/api/editor'
  import DataGrid from '@/components/data-grid/DataGrid.vue'
  import FlowDetailModal from './components/flow-detail-modal.vue'
  import apiErrorMessage from './utils/api-error'
  import { quoteFlowIdent } from './utils/flow-sql'
  import { toObj } from '../logs/query/until'

  const { t } = useI18n()

  const displayedColumns = [
    'flow_name',
    'sink_table_name',
    'source_table_names',
    'comment',
    'created_time',
    'updated_time',
    'operate',
  ]

  const columns = shallowRef<Array<ColumnType>>([])
  const allFlows = shallowRef<Array<any>>([])
  const loading = ref(false)
  const modalVisible = ref(false)
  const modalInstanceKey = ref(0)
  const editData = ref(null)
  const schemaColumns = shallowRef<Array<ColumnType>>([])

  const searchKeyword = ref('')
  const sourceTableFilter = ref<string | undefined>()
  const sinkTableFilter = ref<string | undefined>()

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

  // SELECT * for schema compatibility (new columns like eval_*). UI still filters via
  // displayedColumns; flow_definition may be present but edit uses SHOW CREATE FLOW.
  const FLOW_LIST_SQL = `SELECT * FROM information_schema.flows ORDER BY created_time DESC`

  function list() {
    loading.value = true
    editorAPI
      .runSQL(FLOW_LIST_SQL, undefined, { suppressErrorToast: true })
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
          // Two buttons + gap + cell padding; estimated width only sees "Actions".
          width: 168,
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
            // Absorb leftover here instead of stretching the Actions column.
            if (columnName === 'comment') {
              return { ...col, flex: true }
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
        Message.error(t('flow.loadFailed', { msg: apiErrorMessage(error, t('common.unknownError')) }))
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
    editData.value = null
    modalInstanceKey.value += 1
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
    editData.value = record
    modalInstanceKey.value += 1
    modalVisible.value = true
  }

  function del(record) {
    // Flow names are identifiers: quote them so `my-flow` or mixed-case names work.
    editorAPI
      .runSQL(`DROP FLOW IF EXISTS ${quoteFlowIdent(record.flow_name)}`, undefined, {
        suppressErrorToast: true,
      })
      .then(() => {
        Message.success(t('flow.deleted'))
        list()
      })
      .catch((error) => {
        console.error('Delete flow failed:', error)
        Message.error(t('flow.deleteFailed', { msg: apiErrorMessage(error, t('common.unknownError')) }))
      })
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
    width: 100%;

    :deep(.dg-grid-host),
    :deep(.vxe-table),
    :deep(.vxe-grid) {
      width: 100%;
      max-width: 100%;
    }

    .flow-name-link {
      max-width: 100%;
      padding: 0;
      border: 0;
      overflow: hidden;
      background: transparent;
      color: var(--gpt-accent-ts);
      font: inherit;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    :deep(.flow-sink-cell .cell-content),
    :deep(.flow-sink-cell .arco-table-td-content) {
      color: var(--gpt-brand-600);
      font-weight: 600;
    }
  }
</style>
