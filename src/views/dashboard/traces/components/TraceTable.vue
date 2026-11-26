<template lang="pug">
a-card(:bordered="false")
  template(#title)
    .results-header
      span {{ $t('logsQuery.results') }}
  template(#extra)
    a-space
      a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
        a-button(type="text")
          span.gpt-text-secondary {{ $t('logsQuery.columns') }}
          span.gpt-text-secondary(v-if="hiddenColumnCount" style="margin-left: 6px; font-size: 12px") · {{ $t('logsQuery.hiddenColumnsHint', { count: hiddenColumnCount }) }}
        template(#content)
          a-card.gpt-popover-panel.gpt-popover-panel--wide
            ColumnLayoutPanel(
              :ordered-names="orderedOrderableNames"
              :visible-names="visibleOrderableColumnNames"
              @update:ordered-names="onPanelOrder"
              @update:visible-names="onPanelVisible"
            )

  DataGrid(
    v-model:page="currentPage"
    v-model:page-size="pageSize"
    :pagination="paginationConfig"
    :data="data"
    :columns="visibleColumns"
    :loading="loading"
    :column-mode="'separate'"
    :displayed-columns="visibleColumnNames"
    :ts-column="tsColumn"
    :column-drag="true"
    :pinned-column-fields="pinnedColumnFields"
    :show-context-menu="queryState.editorType === 'builder'"
    :class="{ builder_type: queryState.editorType === 'builder', trace_table: true }"
    @filter-condition-add="$emit('filterConditionAdd', $event)"
    @column-order-change="handleColumnOrderChange"
  )
    template(#column-trace_id="{ record }")
      span.trace-id-actions
        button.trace-id-link(type="button" @click="handleTraceClick(record)") {{ record.trace_id }}
        a-dropdown(
          v-if="showLogsTraceMenu"
          trigger="click"
          @select="(value) => handleLogsMenuSelect(String(value), record)"
        )
          button.trace-id-logs-trigger(type="button" :aria-label="$t('drilldown.traces.openLogs')" @click.stop)
            icon-down
          template(#content)
            a-doption(value="logs")
              span.logs-menu-row
                span {{ $t('drilldown.traces.openLogs') }}
                span.logs-menu-target(v-if="logsTargetLabel(record)" :title="logsTargetLabel(record)") {{ logsTargetLabel(record) }}
            a-doption(v-if="logsAmbiguousService(record)" value="mapping")
              | {{ $t('drilldown.traces.logsMappingAmbiguous') }}
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { IconDown } from '@arco-design/web-vue/es/icon'
  import type { PropType } from 'vue'
  import type { ColumnType, QueryState } from '@/types/query'
  import useTraceTablePrefs from '@/observability/use-trace-table-prefs'
  import ColumnLayoutPanel from '@/components/column-layout-panel/ColumnLayoutPanel.vue'
  import DataGrid from '@/components/data-grid/DataGrid.vue'

  function isTraceIdColumn(name: string): boolean {
    return name === 'trace_id' || name === 'traceid'
  }

  function isPinnedTraceColumn(name: string): boolean {
    return isTraceIdColumn(name) || name === 'timestamp'
  }

  interface LogsTargetInfo {
    database: string
    table: string
    source: 'manual' | 'auto' | 'current'
  }

  interface TableData {
    [key: string]: any
  }

  const props = defineProps({
    data: {
      type: Array as PropType<TableData[]>,
      default: () => [],
    },
    columns: {
      type: Array as PropType<ColumnType[]>,
      default: () => [],
    },
    loading: {
      type: Boolean,
      default: false,
    },
    queryState: {
      type: Object as PropType<QueryState>,
      default: () => ({}),
    },
    /** Drilldown embed: adds the logs action to the row menu. Trace click always emits `traceClick`. */
    embedMode: {
      type: Boolean,
      default: false,
    },
    /** Embed mode only. Shows a logs action when the resolved logs schema has a trace id column. */
    logsTraceEnabled: {
      type: Boolean,
      default: false,
    },
    /** Pre-resolved trace → logs routing per service (traces home fills this at table load). */
    logsTargets: {
      type: Object as PropType<Record<string, LogsTargetInfo>>,
      default: () => ({}),
    },
    /** Services whose probe matched several tables — surfaced so the user can pick. */
    logsAmbiguous: {
      type: Object as PropType<Record<string, string[]>>,
      default: () => ({}),
    },
  })

  const emit = defineEmits<{
    (e: 'filterConditionAdd', payload: unknown): void
    (e: 'traceClick', payload: { traceId: string; timestamp?: unknown }): void
    (e: 'logsTraceClick', payload: { traceId: string; service?: string }): void
    (e: 'openLogsSettings'): void
  }>()

  // Column layout is stored per trace table (`traceTableColumns`).
  const {
    displayedColumnsFor,
    orderedColumnsFor,
    setColumnLayout,
    setVisibleColumns,
    setColumnOrder,
    hiddenColumnCountFor,
  } = useTraceTablePrefs(() => props.queryState.table || '')
  const columnNames = computed(() => props.columns.map((column) => column.name))
  const orderableColumnNames = computed(() => columnNames.value.filter((name) => !isPinnedTraceColumn(name)))
  const visibleOrderableColumnNames = computed(() => displayedColumnsFor(orderableColumnNames.value))
  // Panel order covers hidden columns too, so their order can be dragged and kept.
  const orderedOrderableNames = computed(() => orderedColumnsFor(orderableColumnNames.value))
  // Pin trace_id (and let DataGrid pin timestamp); layout array covers the rest.
  const visibleColumnNames = computed(() => {
    const ordered = visibleOrderableColumnNames.value
    const traceId = columnNames.value.find(isTraceIdColumn)
    const ts = columnNames.value.includes('timestamp') ? 'timestamp' : ''
    const head = [traceId, ts].filter((name): name is string => Boolean(name))
    return [...head, ...ordered.filter((name) => !isPinnedTraceColumn(name))]
  })
  const hiddenColumnCount = computed(() => hiddenColumnCountFor(orderableColumnNames.value))

  const pageSize = ref(20)
  const currentPage = ref(1)
  // Stable references — inline objects would rebuild DataGrid columns every render.
  const tsColumn = { name: 'timestamp', data_type: 'TimestampNanosecond' } as const
  const pinnedColumnFields = computed(() => {
    const pinned = [tsColumn.name]
    const traceId = columnNames.value.find(isTraceIdColumn)
    if (traceId) {
      pinned.push(traceId)
    }
    return pinned
  })
  const pageSizeOptions = [10, 20, 50, 100]
  const paginationConfig = computed(() => ({
    pageSize: pageSize.value,
    pageSizeOptions,
  }))

  const visibleColumns = computed(() => {
    const ordered = visibleColumnNames.value
    const rank = new Map(ordered.map((name, index) => [name, index]))
    return props.columns
      .filter((col) => rank.has(col.name))
      .sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0))
  })

  function onPanelOrder(names: string[]) {
    setColumnLayout(orderableColumnNames.value, names, visibleOrderableColumnNames.value)
  }

  function onPanelVisible(names: string[]) {
    setVisibleColumns(orderableColumnNames.value, names)
  }

  function handleColumnOrderChange(fields: string[]) {
    setColumnOrder(orderableColumnNames.value, fields)
  }

  watch(
    () => props.data,
    () => {
      currentPage.value = 1
    }
  )

  const showLogsTraceMenu = computed(() => props.embedMode && props.logsTraceEnabled)

  function openLogsTrace(traceId: string, service?: string) {
    emit('logsTraceClick', { traceId, service })
  }

  function logsTargetInfo(record: TableData): LogsTargetInfo | undefined {
    const service = record?.service_name
    return service ? props.logsTargets[service] : undefined
  }

  function logsTargetLabel(record: TableData): string {
    const target = logsTargetInfo(record)
    return target ? `${target.database}.${target.table}` : ''
  }

  function logsAmbiguousService(record: TableData): string[] | undefined {
    const service = record?.service_name
    const tables = service ? props.logsAmbiguous[service] : undefined
    return tables?.length ? tables : undefined
  }

  function handleLogsMenuSelect(value: string, record: TableData) {
    if (value === 'logs') {
      openLogsTrace(record.trace_id, record.service_name)
      return
    }
    if (value === 'mapping') {
      emit('openLogsSettings')
    }
  }

  function handleTraceClick(record: TableData) {
    const traceId = String(record?.trace_id ?? '')
    // The parent decides where the detail opens (drawer on the list page, no URL change).
    emit('traceClick', { traceId, timestamp: record?.timestamp })
  }
</script>

<style lang="less" scoped>
  .results-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: normal;
  }

  .trace-id-actions {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-width: 0;
    gap: 2px;
  }

  // Match the time column accent (global `.timestamp-cell`, dataView.less) —
  // a-link's Arco link color broke the table's unified cell colors.
  .trace-id-link {
    max-width: 100%;
    padding: 0;
    border: 0;
    overflow: hidden;
    background: transparent;
    color: var(--gpt-accent-ts);
    font: inherit;
    text-align: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .trace-id-logs-trigger {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: var(--gpt-radius-sm);
    background: transparent;
    color: var(--color-text-3);
    cursor: pointer;

    &:hover {
      color: var(--color-text-1);
      background: var(--color-fill-2);
    }
  }

  .logs-menu-row {
    display: inline-flex;
    max-width: 100%;
    align-items: baseline;
    gap: 8px;
  }

  .logs-menu-target {
    overflow: hidden;
    color: var(--gpt-text-muted);
    font-family: var(--font-mono);
    font-size: var(--gpt-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
