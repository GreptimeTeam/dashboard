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

  /** Time selection state - shared across components */
  const rangeTime = ref<Array<string>>([])
  const time = ref(opts.defaultTimeLength)
  const timeRangeValues = computed(() => {
    if (rangeTime.value.length === 2) {
      // Absolute time range - convert timestamps to ISO strings
      const start = new Date(Number(rangeTime.value[0]) * 1000).toISOString()
      const end = new Date(Number(rangeTime.value[1]) * 1000).toISOString()
      return [`'${start}'`, `'${end}'`]
    }
    if (time.value > 0) {
      // Relative time range - use SQL interval (no quotes around SQL functions)
      const start = `now() - Interval '${time.value}m'`
      const end = `now()`
      return [start, end]
    }
    return [] // Any time / no time limit
  })

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
  const columns = shallowRef<Array<{ name: string; data_type: string; label: string; semantic_type: string }>>([])

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

  /** Computed timestamp column from form state - readonly property */
  const tsColumn = computed(() => {
    console.log('builderFormState store', builderFormState.value)
    return builderFormState.value?.tsColumn || null
  })

  /** Helper functions for SQL builder logic */
  function escapeSqlString(value: string) {
    if (typeof value !== 'string') {
      return value
    }
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  }

  function getFieldType(fieldName: string): string {
    const field = columns.value.find((f) => f.name === fieldName)
    if (!field) return 'Default'

    const dataType = field.data_type.toLowerCase()

    if (dataType.includes('timestamp') || dataType.includes('date')) {
      return 'Time'
    }
    if (
      dataType.includes('int') ||
      dataType.includes('float') ||
      dataType.includes('double') ||
      dataType.includes('decimal')
    ) {
      return 'Number'
    }
    if (dataType.includes('bool')) {
      return 'Boolean'
    }
    if (dataType.includes('string') || dataType.includes('varchar') || dataType.includes('text')) {
      return 'String'
    }

    return 'Default'
  }

  function singleCondition(condition: any) {
    const column = condition.field
    const columnType = getFieldType(column)
    const conditionVal = escapeSqlString(condition.value)
    let columnName = condition.field
    columnName = `"${columnName}"`

    if (condition.operator === 'Exist') {
      return `${columnName} is not null`
    }
    if (condition.operator === 'Not Exist') {
      return `${columnName} is null`
    }
    if (columnType === 'Number' || columnType === 'Time') {
      return `${columnName} ${condition.operator} ${condition.value}`
    }
    if (condition.operator === 'like') {
      return `${columnName} like '%${conditionVal}%'`
    }
    if (['contains', 'not contains', 'match sequence'].indexOf(condition.operator) > -1) {
      let val = escapeSqlString(condition.value)
      if (condition.operator === 'not contains') {
        val = `-"${val}"`
      } else if (condition.operator === 'contains') {
        val = `"${val}"`
      }
      return `MATCHES(${columnName},'${val}')`
    }
    return `${columnName} ${condition.operator} '${escapeSqlString(condition.value)}'`
  }

  /** Build SQL from form state and time ranges */
  /**
   * Build SQL from form state and time ranges
   *
   * @param formState - The form state object containing table, conditions, orderBy, etc.
   * @param timeRanges - Optional array of time range values for timestamp filtering (uses store values if not provided)
   * @param timestampColumn - Optional timestamp column object with name property (uses store value if not provided)
   * @returns Generated SQL string
   *
   * @example
   * ```typescript
   * // Basic usage with form state only - uses store's timeRangeValues and tsColumn
   * const sql = buildSQLFromFormState(formState)
   *
   * // With custom time ranges and timestamp column
   * const sql = buildSQLFromFormState(formState, customTimeRanges, customTsColumn)
   *
   * // With custom time ranges but store's timestamp column
   * const sql = buildSQLFromFormState(formState, customTimeRanges)
   * ```
   */
  function buildSQLFromFormState(formState: any, timeRanges?: any[], timestampColumn?: any): string {
    if (!formState?.table) return ''

    const form = formState
    const conditions = form.conditions || []

    // Use store values as fallbacks if parameters are not provided
    const effectiveTimeRanges = timeRanges || timeRangeValues.value
    const effectiveTimestampColumn = timestampColumn || tsColumn.value

    // Process conditions
    const processedConditions = conditions
      .filter((condition) => {
        if (condition.operator === 'Not Exist' || condition.operator === 'Exist') {
          return condition.field
        }
        return condition.field && condition.operator && condition.value
      })
      .map((condition, index) => {
        let conditionStr = singleCondition(condition)
        // Add relation for conditions after the first one
        if (index > 0) {
          conditionStr = `${condition.relation || 'AND'} ${conditionStr}`
        }
        return conditionStr
      })

    // Add timestamp range condition when timeRanges is provided
    const timeConditions = [...processedConditions]
    if (effectiveTimeRanges && effectiveTimeRanges.length > 0 && effectiveTimestampColumn) {
      let timeCondition = ''
      if (effectiveTimeRanges[0] && !effectiveTimeRanges[1]) {
        timeCondition = `${effectiveTimestampColumn.name} > $timestart`
      } else if (effectiveTimeRanges[1] && !effectiveTimeRanges[0]) {
        timeCondition = `${effectiveTimestampColumn.name} < $timeend`
      } else if (effectiveTimeRanges[0] && effectiveTimeRanges[1]) {
        timeCondition = `${effectiveTimestampColumn.name} <= $timeend AND ${effectiveTimestampColumn.name} >= $timestart`
      }

      if (timeCondition && timeConditions.length > 0) {
        timeConditions.push(`AND ${timeCondition}`)
      } else if (timeCondition) {
        timeConditions.push(timeCondition)
      }
    }

    // Build SQL
    let sql = `SELECT * FROM "${form.table}"`
    if (timeConditions.length > 0) {
      sql += ` WHERE ${timeConditions.join(' ')}`
    }
    if (form.orderByField) {
      sql += ` ORDER BY "${form.orderByField}" ${form.orderBy || 'DESC'}`
    }
    sql += ` LIMIT ${form.limit || limit.value}`

    return sql
  }

  /** Computed builder SQL generated from form state */
  const builderSql = computed(() => {
    return buildSQLFromFormState(builderFormState.value)
  })

  /** Final query with time processing */
  const finalQuery = computed(() => {
    // Time processing is handled by SQLBuilder for builder mode
    // For editor mode, we need to process time range manually
    const query = editorType.value === 'builder' ? builderSql.value : editorSql.value

    let processedSql = query

    // Enhanced time processing logic
    if (timeRangeValues.value.length === 2) {
      // Use processed time range values directly (preferred for logs)
      const [startTs, endTs] = timeRangeValues.value
      processedSql = processedSql.replace(/\$timestart/g, `${startTs}`).replace(/\$timeend/g, `${endTs}`)
    }

    return processedSql
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
      editorSql.value = builderSql.value
    }
  })

  // Watch for changes and update URL automatically
  watch([editorType, time, rangeTime, editorSql, builderFormState], updateQueryParams, { deep: true })

  function reset() {
    builderFormState.value = null
    editorSql.value = ''
    time.value = opts.defaultTimeLength
    rangeTime.value = []
    editorType.value = opts.defaultEditorType as 'builder' | 'text'
    refresh.value = false
    loading.value = false
    columns.value = []
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

    // Query execution state
    loading,
    columns,

    // Computed utilities
    tsColumn,

    // Methods
    reset,
    initializeFromQuery,
    updateQueryParams,
    executeBaseQuery,
    executeQuery,
    exportToCSV,
    addFilterCondition,
    buildSQLFromFormState,

    // Options for customization
    options: opts,
  }
}
