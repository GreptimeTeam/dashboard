import { ref, computed, reactive } from 'vue'
import type { BuilderFormState, QueryState } from '@/types/query'

const generateSql = (builderFormState: BuilderFormState, timeRange: any[]) => {
  const [startTs, endTs] = timeRange
  return builderFormState.sql.replace(/\$timestart/g, `${startTs}`).replace(/\$timeend/g, `${endTs}`)
}

const useQueryExecution = (builder, textEditorState, timeRange) => {
  const editorType = ref<'builder' | 'text'>('builder')
  const defaultQueryState: QueryState = {
    editorType: 'builder',
    tsColumn: null,
    table: '',
    timeRangeValues: [],
    time: 10,
    rangeTime: [],
    limit: 1000,
    orderBy: 'DESC',
    sourceState: builder.builderFormState,
    generateSql: () => {
      return ''
    },
  }
  const queryState = reactive<QueryState>({ ...defaultQueryState })
  const loading = ref(false)
  const columns = ref<any[]>([])
  const rows = shallowRef<any[]>([])

  const executableSql = computed(() => {
    if (editorType.value === 'builder') {
      return builder.builderSql.value
    }
    return textEditorState.value.sql
  })

  const canExecuteInitialQuery = computed(() => {
    if (editorType.value === 'builder') {
      return builder.builderSql.value && builder.builderFormState.tsColumn
    }
    return textEditorState.value.sql && textEditorState.value.tsColumn
  })

  async function executeQuery() {
    console.log(builder.builderFormState, 'builder.builderFormState executeQuery')
    let currentQuery = executableSql.value
    Object.assign(queryState, {
      editorType: editorType.value,
      sql: currentQuery,
      tsColumn: editorType.value === 'builder' ? builder.builderFormState.tsColumn : textEditorState.value.tsColumn,
      table: editorType.value === 'builder' ? builder.builderFormState.table : textEditorState.value.table,
      timeRangeValues: [...timeRange.timeRangeValues.value],
      time: timeRange.time.value,
      rangeTime: [...timeRange.rangeTime.value],
      sourceState: editorType.value === 'builder' ? builder.builderFormState : textEditorState.value,
      generatedSql: editorType.value === 'builder' ? builder.buildSQLFromFormState : generateSql,
    })
    // Process $timestart and $timeend in the SQL string
    const currentTimeRanges = timeRange.timeRangeValues.value
    if (currentTimeRanges.length === 2) {
      const [startTs, endTs] = currentTimeRanges
      currentQuery = currentQuery.replace(/\$timestart/g, `${startTs}`).replace(/\$timeend/g, `${endTs}`)
    }
    if (!currentQuery) return []
    loading.value = true
    try {
      const { default: editorAPI } = await import('@/api/editor')
      const result = await editorAPI.runSQL(currentQuery)
      if (result.output?.[0]?.records) {
        const { records } = result.output[0]
        columns.value = records.schema.column_schemas.map((col) => ({
          name: col.name,
          data_type: col.data_type,
          label: col.name,
          semantic_type:
            col.semantic_type?.toString() ||
            (col.data_type?.toLowerCase().includes('timestamp') ? 'TIMESTAMP' : 'FIELD'),
        }))

        const processedRows = records.rows.map((row) => {
          const record = {}
          records.schema.column_schemas.forEach((col, index) => {
            record[col.name] = row[index]
          })
          return record
        })
        rows.value = processedRows
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
    let currentQuery = executableSql.value
    // Process $timestart and $timeend in the SQL string
    const currentTimeRanges = timeRange.timeRangeValues.value
    if (currentTimeRanges.length === 2) {
      const [startTs, endTs] = currentTimeRanges
      currentQuery = currentQuery.replace(/\$timestart/g, `${startTs}`).replace(/\$timeend/g, `${endTs}`)
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
    if (newMode === 'text' && !textEditorState.value.sql && builder.builderSql.value) {
      textEditorState.value.sql = builder.builderSql.value
    }
  })

  return {
    editorType,
    executableSql,
    executeQuery,
    exportToCSV,
    queryState,
    loading,
    columns,
    rows,
    canExecuteInitialQuery,
  }
}

export default useQueryExecution
