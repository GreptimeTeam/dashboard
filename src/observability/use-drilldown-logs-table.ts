import { computed, isRef, ref, type MaybeRef, type Ref } from 'vue'
import type { DrilldownContext } from '@/observability/context'
import { fetchLogsRows } from '@/observability/adapters/logs'
import type { ColumnType, TSColumn } from '@/types/query'

const DEFAULT_PAGE_SIZE = 50

/**
 * Drilldown logs table data: initial fetch + keyset append for infinite scroll.
 */
export default function useDrilldownLogsTable(
  ctx: DrilldownContext,
  options: {
    labelCol?: Ref<string | undefined>
    labelValue?: Ref<string | undefined>
    /** Panel-local legend selection. Empty shows every level. */
    levels?: Ref<string[]>
    pageSize?: number
    /** When false, one fetch only (overview preview). */
    infinite?: boolean
    /** Restrict SELECT columns. Empty or unset means the full schema. */
    columns?: MaybeRef<string[] | undefined>
  } = {}
) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const infinite = options.infinite !== false

  function resolveColumns(): string[] | undefined {
    const raw = options.columns
    if (raw == null) {
      return undefined
    }
    return isRef(raw) ? raw.value : raw
  }
  const loading = ref(false)
  const loadingMore = ref(false)
  const tableColumns = ref<ColumnType[]>([])
  const tableData = ref<Array<Record<string, unknown>>>([])
  const tsColumn = ref<TSColumn | null>(null)
  const hasMore = ref(false)

  const displayedColumns = computed(() => tableColumns.value.map((column) => column.name))

  function oldestTs(): unknown | undefined {
    const name = tsColumn.value?.name
    if (!name || !tableData.value.length) {
      return undefined
    }
    const last = tableData.value[tableData.value.length - 1]
    return last?.[name]
  }

  async function load() {
    if (!ctx.logsTable.value) {
      tableColumns.value = []
      tableData.value = []
      tsColumn.value = null
      hasMore.value = false
      return
    }
    // Refresh / URL detail opens before buildLogsFieldMap finishes — wait for roles.
    if (!ctx.fieldMap.value.logs.time) {
      loading.value = true
      return
    }

    loading.value = true
    loadingMore.value = false
    try {
      const rows = await fetchLogsRows(ctx, {
        labelCol: options.labelCol?.value,
        value: options.labelValue?.value,
        levels: options.levels?.value,
        limit: pageSize,
        columns: resolveColumns(),
      })
      tableColumns.value = rows.columns
      tableData.value = rows.data
      tsColumn.value = rows.tsColumn
      hasMore.value = infinite && rows.hasMore
    } catch (error) {
      console.error('Failed to load drilldown logs', error)
      tableColumns.value = []
      tableData.value = []
      tsColumn.value = null
      hasMore.value = false
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!infinite || loading.value || loadingMore.value || !hasMore.value) {
      return
    }
    const beforeTs = oldestTs()
    if (beforeTs === undefined || beforeTs === null) {
      hasMore.value = false
      return
    }
    loadingMore.value = true
    try {
      const rows = await fetchLogsRows(ctx, {
        labelCol: options.labelCol?.value,
        value: options.labelValue?.value,
        levels: options.levels?.value,
        limit: pageSize,
        beforeTs,
        keyOffset: tableData.value.length,
        columns: resolveColumns(),
      })
      if (rows.columns.length) {
        tableColumns.value = rows.columns
      }
      if (rows.tsColumn) {
        tsColumn.value = rows.tsColumn
      }
      tableData.value = [...tableData.value, ...rows.data]
      hasMore.value = rows.hasMore
    } catch (error) {
      console.error('Failed to load more drilldown logs', error)
    } finally {
      loadingMore.value = false
    }
  }

  return {
    loading,
    loadingMore,
    tableColumns,
    tableData,
    tsColumn,
    hasMore,
    displayedColumns,
    load,
    loadMore,
  }
}
