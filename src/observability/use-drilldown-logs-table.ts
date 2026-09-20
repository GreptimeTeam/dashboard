import { computed, isRef, ref, watch, type MaybeRef, type Ref } from 'vue'
import type { DrilldownContext } from '@/observability/context'
import { fetchLogsRows } from '@/observability/adapters/logs'
import { loadDrilldownSettings } from '@/observability/drilldown-settings'
import type { ColumnType, TSColumn } from '@/types/query'

/** Rows fetched per page — matches the Grafana logs line limit (1000). */
const DEFAULT_PAGE_SIZE = 1000

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
    /** Extra AND clause applied to this table only. */
    extraWhere?: MaybeRef<string | undefined>
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

  function resolveExtraWhere(): string | undefined {
    const raw = options.extraWhere
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

  /**
   * The table cannot build its SQL before the logs field map resolves the time role.
   * Waiting here (instead of leaving `loading` true and returning) keeps a table that
   * mounted mid-restore — e.g. jumping traces → logs detail with a filter — from spinning
   * forever with no request in flight.
   */
  function waitForTimeRole(timeoutMs = 1500): Promise<void> {
    if (ctx.fieldMap.value.logs.time) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const stop = watch(
        () => ctx.fieldMap.value.logs.time,
        (value) => {
          if (!value) {
            return
          }
          stop()
          clearTimeout(timer)
          resolve()
        }
      )
      const timer = setTimeout(() => {
        stop()
        if (!ctx.fieldMap.value.logs.time) {
          console.warn('Logs field map did not resolve a time column; loading table anyway.')
        }
        resolve()
      }, timeoutMs)
    })
  }

  /**
   * The context field map is built asynchronously (schema fetch + settings). When it has not
   * landed yet, the saved settings already know the time column — priming it from there lets
   * the first request go out immediately instead of waiting for the rebuild.
   */
  function primeTimeRoleFromSettings(): void {
    if (ctx.fieldMap.value.logs.time) {
      return
    }
    const saved = loadDrilldownSettings().logs.fieldMap?.time?.trim()
    if (!saved) {
      return
    }
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: { ...ctx.fieldMap.value.logs, time: saved },
    }
  }

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
      primeTimeRoleFromSettings()
    }
    if (!ctx.fieldMap.value.logs.time) {
      loading.value = true
      await waitForTimeRole()
      if (!ctx.logsTable.value) {
        tableColumns.value = []
        tableData.value = []
        tsColumn.value = null
        hasMore.value = false
        loading.value = false
        return
      }
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
        extraWhere: resolveExtraWhere(),
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
        extraWhere: resolveExtraWhere(),
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
