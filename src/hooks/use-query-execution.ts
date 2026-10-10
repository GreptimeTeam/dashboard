import { ref, reactive, computed, watch, shallowRef } from 'vue'
import { replaceTimePlaceholders, getTableRefForSql } from '@/utils/sql'
import { normalizeLogTimeBoundToMs } from '@/utils/log-time-cursor'
import {
  buildKeysetIsoSqlRange,
  freezeUnixTimeRange,
  isCursorInsideFrozenWindow,
  type FrozenUnixRange,
} from '@/utils/log-keyset-window'
import type { ColumnType, QueryState } from '@/types/query'

const useQueryExecution = (builder, textEditor, timeRange) => {
  const editorType = ref<'builder' | 'text'>('builder')
  const queryState = reactive<QueryState>({
    editorType: 'builder',
    tsColumn: null,
    table: '',
    timeRangeValues: [],
    time: 10,
    rangeTime: [],
    frozenUnixRange: null,
    limit: 1000,
    orderBy: 'DESC',
    sourceState: builder.builderFormState,
    sql: '',
    generateSql: () => {
      return ''
    },
  })
  const loading = ref(false)
  const loadingMore = ref(false)
  /** More rows can be fetched by scrolling (keyset-style time window). */
  const hasMore = ref(false)
  const columns = shallowRef<ColumnType[]>([])
  const rows = shallowRef<any[]>([])
  const totalRowCount = ref<number | null>(null)

  const hasExecutedInitialQuery = ref(false)

  /** Page size actually used by the SQL (text mode may set LIMIT inline). */
  function resolvePageSize(): number {
    const match = /limit\s+(\d+)\s*;?\s*$/i.exec((queryState.sql || '').trim())
    if (match) {
      const fromSql = Number(match[1])
      if (fromSql > 0) {
        return fromSql
      }
    }
    const fromState = Number(queryState.limit)
    return fromState > 0 ? fromState : 0
  }

  const canExecuteInitialQuery = computed(() => {
    if (editorType.value === 'builder') {
      return builder.builderFormState.table && builder.builderFormState.tsColumn && !hasExecutedInitialQuery.value
    }
    return textEditor.textEditorState.sql && textEditor.textEditorState.tsColumn && !hasExecutedInitialQuery.value
  })

  function getCurrentStateProp(prop: string) {
    if (editorType.value === 'builder') {
      return builder.builderFormState[prop]
    }
    return textEditor.textEditorState[prop]
  }

  async function getTotalRowCount() {
    if (!queryState.table || !queryState.sql) {
      totalRowCount.value = null
      return
    }

    try {
      const currentTimeRanges = timeRange.timeRangeValues.value
      const currentSql = replaceTimePlaceholders(queryState.sql, currentTimeRanges)

      // Extract WHERE clause from the original SQL
      const whereMatch = currentSql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i)
      const whereClause = whereMatch ? `WHERE ${whereMatch[1]}` : ''

      const tableName = getTableRefForSql(queryState)
      const countSql = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`

      const { default: editorAPI } = await import('@/api/editor')
      const database = getCurrentStateProp('database') as string | undefined
      const result: any = await editorAPI.runSQL(countSql, database)

      if (result.output?.[0]?.records) {
        const { records } = result.output[0]
        if (records.rows?.[0]?.[0] !== undefined) {
          totalRowCount.value = Number(records.rows[0][0])
        } else {
          totalRowCount.value = null
        }
      } else {
        totalRowCount.value = null
      }
    } catch (error) {
      console.error('Failed to get total row count:', error)
      totalRowCount.value = null
    }
  }

  async function executeQuery(isNewQuery = true) {
    hasExecutedInitialQuery.value = true
    let currentSql = ''
    if (!isNewQuery) {
      currentSql = queryState.sql
    } else {
      currentSql =
        editorType.value === 'builder'
          ? builder.generateSql(builder.builderFormState, timeRange.timeRangeValues.value)
          : textEditor.textEditorState.sql
    }
    if (getCurrentStateProp('table') !== queryState?.table) {
      columns.value = []
      rows.value = []
    }
    // Freeze absolute bounds once per Run/refresh so loadMore never re-evaluates
    // relative `now() - Interval` and never mutates toolbar time.
    const frozen = freezeUnixTimeRange({
      time: timeRange.time.value,
      rangeTime: timeRange.rangeTime.value,
    })
    queryState.frozenUnixRange = frozen

    if (isNewQuery) {
      // Update queryState directly since it's reactive
      Object.assign(queryState, {
        editorType: editorType.value,
        sql: currentSql,
        tsColumn: getCurrentStateProp('tsColumn'),
        table: getCurrentStateProp('table'),
        database: getCurrentStateProp('database'),
        timeRangeValues: [...timeRange.timeRangeValues.value],
        time: timeRange.time.value,
        rangeTime: [...timeRange.rangeTime.value],
        frozenUnixRange: frozen,
        sourceState: {
          ...(editorType.value === 'builder' ? builder.builderFormState : textEditor.textEditorState),
        },
        generateSql: editorType.value === 'builder' ? builder.generateSql : textEditor.generateSql,
        orderBy: getCurrentStateProp('orderBy'),
        limit: getCurrentStateProp('limit'),
      })
    }

    // Process $timestart and $timeend in the SQL string
    const currentTimeRanges = timeRange.timeRangeValues.value
    currentSql = replaceTimePlaceholders(currentSql, currentTimeRanges)
    if (!currentSql) return []
    loading.value = true
    try {
      const { default: editorAPI } = await import('@/api/editor')
      const database = getCurrentStateProp('database') as string | undefined
      const result = await editorAPI.runSQL(currentSql, database)
      if (result.output?.[0]?.records) {
        const { records } = result.output[0]
        columns.value = records.schema.column_schemas.map((col: any) => ({
          name: col.name,
          data_type: col.data_type,
          title: col.name,
        }))

        const processedRows = records.rows.map((row) => {
          const record = {}
          records.schema.column_schemas.forEach((col, index) => {
            record[col.name] = row[index]
          })
          return record
        })
        rows.value = processedRows
        const pageSize = resolvePageSize()
        hasMore.value = processedRows.length > 0 && (!pageSize || processedRows.length >= pageSize)
        loadingMore.value = false

        // Get total row count after successful query
        if (isNewQuery) {
          getTotalRowCount()
        }

        return processedRows
      }
      return []
    } catch (error) {
      console.error('Query failed:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  /** Cursor value as a SQL literal (bare when numeric, quoted otherwise). */
  function toSqlTimeLiteral(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    const text = String(value ?? '')
    if (/^\d+(\.\d+)?$/.test(text)) {
      return text
    }
    return `'${text.replace(/'/g, "''")}'`
  }

  function isBeyondCursor(value: unknown, cursorMs: number, older: boolean): boolean {
    const valueMs = normalizeLogTimeBoundToMs(value)
    if (!Number.isFinite(valueMs)) {
      return false
    }
    return older ? valueMs < cursorMs : valueMs > cursorMs
  }

  /**
   * Scroll loading: keyset older/newer pages without rewriting toolbar time.
   * Relative Run windows use absolute ISO bounds so `now()` does not drift.
   * Anytime (no frozen window) still keysets on the cursor with 1970 / now() defaults.
   */
  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value || !queryState.sql) {
      return
    }
    const tsName = queryState.tsColumn?.name
    if (!tsName || !rows.value.length) {
      hasMore.value = false
      return
    }
    const frozen = queryState.frozenUnixRange as FrozenUnixRange | null | undefined
    const older = (queryState.orderBy || 'DESC') === 'DESC'
    const direction = older ? 'older' : 'newer'
    const cursor = older ? rows.value[rows.value.length - 1]?.[tsName] : rows.value[0]?.[tsName]
    const cursorMs = normalizeLogTimeBoundToMs(cursor)
    if (!Number.isFinite(cursorMs)) {
      hasMore.value = false
      return
    }

    const range = buildKeysetIsoSqlRange(frozen, cursor, direction, toSqlTimeLiteral(cursor))
    if (!range) {
      hasMore.value = false
      return
    }

    let pageSql = ''
    try {
      pageSql = replaceTimePlaceholders(queryState.generateSql(queryState.sourceState, range), range)
    } catch (error) {
      console.error('Failed to build load-more SQL:', error)
      hasMore.value = false
      return
    }
    // Text queries without $timestart/$timeend cannot be narrowed — stop instead of
    // re-fetching the same rows forever.
    if (!pageSql || pageSql === queryState.sql) {
      hasMore.value = false
      return
    }

    loadingMore.value = true
    try {
      const { default: editorAPI } = await import('@/api/editor')
      const database = getCurrentStateProp('database') as string | undefined
      const result = await editorAPI.runSQL(pageSql, database)
      const records = result?.output?.[0]?.records
      const names: string[] = (records?.schema?.column_schemas ?? []).map((col: { name: string }) => col.name)
      const pageRows: Array<Record<string, unknown>> = (records?.rows ?? []).map((row: unknown[]) => {
        const record: Record<string, unknown> = {}
        names.forEach((name, index) => {
          record[name] = row[index]
        })
        return record
      })
      // The window end is inclusive: drop the cursor row (already displayed).
      const appended = pageRows.filter((row) => isBeyondCursor(row[tsName], cursorMs, older))
      if (appended.length) {
        rows.value = [...rows.value, ...appended]
      }
      const limit = resolvePageSize()
      const tip = appended.length ? appended[appended.length - 1]?.[tsName] : cursor
      // Anytime has no frozen edge; bounded windows stop at the toolbar start/end.
      const stillInside = !frozen || isCursorInsideFrozenWindow(tip, frozen, direction)
      // Full page means there may be more rows further out; a stalled append stops.
      hasMore.value = stillInside && appended.length > 0 && (!limit || pageRows.length >= limit)
    } catch (error) {
      console.error('Failed to load more rows:', error)
    } finally {
      loadingMore.value = false
    }
  }

  async function exportToCSV(limit?: number) {
    let currentQuery = queryState.sql
    // Process $timestart and $timeend in the SQL string
    const currentTimeRanges = timeRange.timeRangeValues.value
    if (currentTimeRanges.length === 2) {
      const [startTs, endTs] = currentTimeRanges
      currentQuery = replaceTimePlaceholders(currentQuery, [startTs, endTs])
    }
    if (!currentQuery || !queryState.table) {
      return
    }

    // Update LIMIT if provided
    if (limit !== undefined) {
      const { updateLimitInSql } = await import('@/views/dashboard/logs/query/until')
      currentQuery = updateLimitInSql(currentQuery, limit)
    }

    try {
      const { default: editorAPI } = await import('@/api/editor')
      const result = await editorAPI.runSQLWithCSV(currentQuery)
      const { default: fileDownload } = await import('js-file-download')
      const filename = queryState.table || 'query-result'
      fileDownload(result as unknown as string, `${filename}.csv`)
    } catch (error) {
      console.error('Export failed:', error)
      throw error
    }
  }

  watch(editorType, (newMode: 'builder' | 'text') => {
    if (newMode === 'text' && builder.builderFormState.table) {
      textEditor.textEditorState.sql = builder.generateSql(builder.builderFormState, timeRange.timeRangeValues.value)
    }
  })

  return {
    editorType,
    executeQuery,
    loadMore,
    exportToCSV,
    queryState,
    loading,
    loadingMore,
    hasMore,
    columns,
    rows,
    totalRowCount,
    canExecuteInitialQuery,
  }
}

export default useQueryExecution
