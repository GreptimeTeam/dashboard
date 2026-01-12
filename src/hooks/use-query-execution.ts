import { ref, reactive, computed, watch, shallowRef } from 'vue'
import { replaceTimePlaceholders } from '@/utils/sql'
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
    limit: 1000,
    orderBy: 'DESC',
    sourceState: builder.builderFormState,
    sql: '',
    generateSql: () => {
      return ''
    },
  })
  const loading = ref(false)
  const columns = shallowRef<ColumnType[]>([])
  const rows = shallowRef<any[]>([])
  const totalRowCount = ref<number | null>(null)

  const hasExecutedInitialQuery = ref(false)
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

      // Build COUNT query
      const countSql = `SELECT COUNT(*) FROM "${queryState.table}" ${whereClause}`

      const { default: editorAPI } = await import('@/api/editor')
      const result: any = await editorAPI.runSQL(countSql)

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
    if (isNewQuery) {
      // Update queryState directly since it's reactive
      Object.assign(queryState, {
        editorType: editorType.value,
        sql: currentSql,
        tsColumn: getCurrentStateProp('tsColumn'),
        table: getCurrentStateProp('table'),
        timeRangeValues: [...timeRange.timeRangeValues.value],
        time: timeRange.time.value,
        rangeTime: [...timeRange.rangeTime.value],
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
      const result = await editorAPI.runSQL(currentSql)
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

  async function exportToCSV() {
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
    exportToCSV,
    queryState,
    loading,
    columns,
    rows,
    totalRowCount,
    canExecuteInitialQuery,
  }
}

export default useQueryExecution
