import { ref, computed, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'

export interface BaseQueryStoreOptions {
  /** Store identifier for debugging */
  storeId: string
  /** Default editor mode */
  defaultEditorType?: 'builder' | 'text'
  /** Default time length in minutes */
  defaultTimeLength?: number
  /** Default limit for query results */
  defaultLimit?: number
  /** Custom URL parameter names */
  urlParams?: {
    editorType?: string
    timeLength?: string
    timeRange?: string
    editorSql?: string
    builderForm?: string
  }
  /** Optional result transformation function */
  transformResults?: (rawRows: any[], columns: any[], additionalData?: any) => any[]
}

export interface QueryExecutionState {
  loading: Ref<boolean>
  columns: Ref<Array<{ name: string; data_type: string; label: string; semantic_type: string }>>
}

export function useBaseQueryStore(options: BaseQueryStoreOptions) {
  const route = useRoute()
  const router = useRouter()

  // Default options
  const opts = {
    defaultEditorType: 'builder',
    defaultTimeLength: 10,
    defaultLimit: 1000,
    urlParams: {
      editorType: 'editorType',
      timeLength: 'timeLength',
      timeRange: 'timeRange',
      editorSql: 'editorSql',
      builderForm: 'builderForm',
    },
    ...options,
  }

  /** Builder SQL from SQL builder component */
  const builderSql = ref('')

  /** Time selection state - shared across components */
  const rangeTime = ref<Array<string>>([])
  const time = ref(opts.defaultTimeLength)
  const timeRangeValues = ref<string[]>([])

  /** Editor configuration - shared */
  const editorType = ref<'builder' | 'text'>(opts.defaultEditorType as 'builder' | 'text')

  /** Editor SQL for text mode */
  const editorSql = ref('')

  /** Builder form state - shared */
  const builderFormState = ref(null)

  /** Query configuration - shared */
  const limit = ref(opts.defaultLimit)

  /** Query execution state - shared */
  const refresh = ref(false)
  const loading = ref(false)
  const columns = ref<Array<{ name: string; data_type: string; label: string; semantic_type: string }>>([])

  /** Computed table name - derived from builder form state or SQL parsing */
  const currentTableName = computed(() => {
    let tableName = ''
    if (editorType.value === 'builder' && builderFormState.value?.table) {
      tableName = builderFormState.value.table
    } else {
      // Parse from editorSql for text mode
      const sqlToCheck = editorSql.value
      const fromMatch = sqlToCheck.trim().match(/FROM\s+([`"']?)(\w+)\1/i)
      if (fromMatch) {
        tableName = fromMatch[2]
      }
    }
    return tableName
  })

  /** Computed values used by multiple components */
  const unixTimeRange = computed(() => {
    if (time.value && time.value > 0) {
      return [dayjs().subtract(time.value, 'minute').unix(), dayjs().unix()]
    }
    return rangeTime.value.map((v) => Number(v))
  })

  /** Final query with time processing */
  const finalQuery = computed(() => {
    // Time processing is handled by SQLBuilder for builder mode
    // For editor mode, we need to process time range manually
    const query = editorType.value === 'builder' ? builderSql.value : editorSql.value

    if (editorType.value === 'text') {
      // Manual time processing for editor mode
      let processedSql = query

      // Enhanced time processing logic
      if (timeRangeValues.value.length === 2) {
        // Use processed time range values directly (preferred for logs)
        const [startTs, endTs] = timeRangeValues.value
        processedSql = processedSql.replace(/\$timestart/g, `'${startTs}'`).replace(/\$timeend/g, `'${endTs}'`)
      } else if (time.value > 0) {
        // Fallback to relative time processing (for traces)
        const start = `now() - Interval '${time.value}m'`
        const end = 'now()'
        processedSql = processedSql.replace(/\$timestart/g, start).replace(/\$timeend/g, end)
      } else if (rangeTime.value.length === 2) {
        // ISO date processing for custom ranges
        const start = new Date(Number(rangeTime.value[0]) * 1000).toISOString()
        const end = new Date(Number(rangeTime.value[1]) * 1000).toISOString()
        processedSql = processedSql.replace(/\$timestart/g, `'${start}'`).replace(/\$timeend/g, `'${end}'`)
      }

      return processedSql
    }

    return query
  })

  // Initialize state from URL query parameters
  function initializeFromQuery() {
    const {
      [opts.urlParams.editorType!]: queryEditorType,
      [opts.urlParams.timeLength!]: queryTimeLength,
      [opts.urlParams.timeRange!]: queryTimeRange,
      [opts.urlParams.editorSql!]: queryEditorSql,
      [opts.urlParams.builderForm!]: queryBuilderForm,
    } = route.query

    // Initialize editor type
    if (queryEditorType && ['builder', 'text'].includes(queryEditorType as string)) {
      editorType.value = queryEditorType as 'builder' | 'text'
    }

    // Initialize time selection
    if (queryTimeLength !== undefined) {
      const length = parseInt(queryTimeLength as string, 10)
      if (!Number.isNaN(length)) {
        time.value = length
      }
    }

    if (queryTimeRange && Array.isArray(queryTimeRange)) {
      rangeTime.value = queryTimeRange as string[]
    }

    // Initialize editor SQL if provided
    if (queryEditorSql) {
      editorSql.value = decodeURIComponent(queryEditorSql as string)
    }

    // Initialize builder form state if provided
    if (queryBuilderForm) {
      try {
        builderFormState.value = JSON.parse(decodeURIComponent(queryBuilderForm as string))
      } catch (error) {
        console.warn(`[${opts.storeId}] Failed to parse builder form state from URL:`, error)
      }
    }
  }

  // Update URL query parameters without navigation
  function updateQueryParams() {
    const query = { ...route.query }

    // Update editor type
    query[opts.urlParams.editorType!] = editorType.value

    // Update time selection
    if (rangeTime.value.length === 2) {
      query[opts.urlParams.timeRange!] = rangeTime.value
      delete query[opts.urlParams.timeLength!]
    } else {
      query[opts.urlParams.timeLength!] = time.value.toString()
      delete query[opts.urlParams.timeRange!]
    }

    // Update editor SQL if in text mode
    if (editorType.value === 'text' && editorSql.value) {
      query[opts.urlParams.editorSql!] = encodeURIComponent(editorSql.value)
    } else {
      delete query[opts.urlParams.editorSql!]
    }

    // Update builder form state if available and in builder mode
    if (editorType.value === 'builder' && builderFormState.value) {
      query[opts.urlParams.builderForm!] = encodeURIComponent(JSON.stringify(builderFormState.value))
    } else {
      delete query[opts.urlParams.builderForm!]
    }

    // Update URL without triggering navigation
    router.replace({ query })
  }

  // Watch for editor type changes - generate editorSql from builder when switching to text
  watch(editorType, (newMode: 'builder' | 'text') => {
    if (newMode === 'text' && !editorSql.value && builderSql.value) {
      // Generate editorSql with time placeholders from builder SQL
      let generatedSql = builderSql.value

      // Replace time conditions with placeholders for common timestamp column patterns
      // This handles both logs (with various timestamp columns) and traces (with timestamp column)
      const timeColumnPatterns = [
        'timestamp',
        'ts',
        'time',
        'created_at',
        'updated_at',
        'event_time',
        'log_time',
        'date_time',
        'datetime',
      ]

      timeColumnPatterns.forEach((columnName) => {
        // Replace time range conditions with placeholders
        generatedSql = generatedSql.replace(
          new RegExp(`${columnName}\\s*>=\\s*[^\\s]+`, 'gi'),
          `${columnName} >= $timestart`
        )
        generatedSql = generatedSql.replace(
          new RegExp(`${columnName}\\s*<=\\s*[^\\s]+`, 'gi'),
          `${columnName} <= $timeend`
        )
      })

      editorSql.value = generatedSql
    }
  })

  // Watch for changes and update URL automatically
  watch([editorType, time, rangeTime, editorSql, builderFormState], updateQueryParams, { deep: true })

  function reset() {
    builderFormState.value = null
    builderSql.value = ''
    editorSql.value = ''
    time.value = opts.defaultTimeLength
    rangeTime.value = []
    timeRangeValues.value = []
    editorType.value = opts.defaultEditorType as 'builder' | 'text'
    refresh.value = false
    loading.value = false
    columns.value = []
  }

  function updateBuilderSql(newSql: string) {
    builderSql.value = newSql
  }

  function updateTimeRangeValues(newTimeRangeValues: string[]) {
    timeRangeValues.value = newTimeRangeValues
  }

  // Base query execution function that can be extended
  async function executeBaseQuery(customExecutor?: (query: string) => Promise<any>) {
    if (!finalQuery.value) return null

    try {
      if (customExecutor) {
        return await customExecutor(finalQuery.value)
      }

      // Default execution using editor API
      const editorAPI = await import('@/api/editor')
      const result = await editorAPI.default.runSQL(finalQuery.value)

      // Update URL parameters only after successful query
      updateQueryParams()

      return result
    } catch (error) {
      console.error(`[${opts.storeId}] Query failed:`, error)
      throw error
    }
  }

  // Unified executeQuery function with results handling
  async function executeQuery(transformCallback?: (rawRows: any[], columnsData: any[], additionalData?: any) => any[]) {
    if (!finalQuery.value) return []

    loading.value = true
    try {
      const editorAPI = await import('@/api/editor')
      const result = await editorAPI.default.runSQL(finalQuery.value)

      if (result.output?.[0]?.records) {
        const records = result.output[0].records as unknown as {
          schema: { column_schemas: Array<{ name: string; data_type: string; semantic_type: string }> }
          rows: any[][]
        }
        columns.value = records.schema.column_schemas.map((col) => ({
          name: col.name,
          data_type: col.data_type,
          label: col.name,
          semantic_type:
            col.semantic_type || (col.data_type?.toLowerCase().includes('timestamp') ? 'TIMESTAMP' : 'FIELD'),
        }))

        // Convert raw rows to objects
        const processedRows = records.rows.map((row: any[]) => {
          const record: any = {}
          records.schema.column_schemas.forEach((col: { name: string }, index: number) => {
            record[col.name] = row[index]
          })
          return record
        })

        // Apply optional transformation if provided and return the result
        const finalRows = transformCallback ? transformCallback(processedRows, columns.value) : processedRows

        // Update URL parameters only after successful query
        updateQueryParams()

        return finalRows
      }

      return []
    } catch (error) {
      console.error(`[${opts.storeId}] Query failed:`, error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // Base export function
  async function exportToCSV() {
    if (!finalQuery.value || !currentTableName.value) {
      return
    }

    try {
      const editorAPI = await import('@/api/editor')
      const result = await editorAPI.default.runSQLWithCSV(finalQuery.value)
      const { default: fileDownload } = await import('js-file-download')
      const filename = currentTableName.value || opts.storeId
      fileDownload(result as unknown as string, `${filename}.csv`)
    } catch (error) {
      console.error(`[${opts.storeId}] Export failed:`, error)
      throw error
    }
  }

  // Filter condition management - shared business logic
  function addFilterCondition(columnName: string, operator: string, value: string) {
    if (!builderFormState.value) {
      console.warn(`[${opts.storeId}] Cannot add filter condition: no builder form state`)
      return
    }

    // Add new condition to the form state
    const newCondition = {
      field: columnName,
      operator,
      value: String(value),
      relation: 'AND',
      isTimeColumn: false,
    }

    if (!builderFormState.value.conditions) {
      builderFormState.value.conditions = []
    }

    builderFormState.value.conditions.push(newCondition)
  }

  // Timestamp column detection - shared business logic
  const timestampColumn = computed(() => {
    if (!columns.value.length) return null

    // Find timestamp columns by data type
    const tsColumns = columns.value.filter((col) => col.data_type.toLowerCase().includes('timestamp'))

    // Prefer columns with TIMESTAMP semantic type if available
    const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
    const selectedColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0]

    if (!selectedColumn) return null

    return {
      name: selectedColumn.name,
      data_type: selectedColumn.data_type,
    }
  })

  return {
    // State
    builderSql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    editorType,
    editorSql,
    builderFormState,
    limit,
    refresh,
    finalQuery,
    unixTimeRange,

    // Query execution state
    loading,
    columns,

    // Computed utilities
    timestampColumn,

    // Methods
    reset,
    initializeFromQuery,
    updateQueryParams,
    updateBuilderSql,
    updateTimeRangeValues,
    executeBaseQuery,
    executeQuery,
    exportToCSV,
    addFilterCondition,

    // Options for customization
    options: opts,
  }
}
