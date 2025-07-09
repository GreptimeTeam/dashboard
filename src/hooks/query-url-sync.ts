import { ref, Ref, ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface QueryUrlSyncOptions {
  // Mode configuration
  modeRef: Ref<string>
  modeParamName?: string // Default: 'editorType' (unified)
  modeValues?: string[] // Default: ['builder', 'text'] (unified)

  // Time configuration
  timeLength: Ref<number>
  timeRange: Ref<string[]>

  // SQL and form state
  editorSql: Ref<string>
  builderFormState: Ref<any>

  // Table name (optional - can be computed or ref)
  tableName?: Ref<string> | ComputedRef<string>

  // Defaults
  defaultMode?: string
  defaultTimeLength?: number
}

export default function useQueryUrlSync(options: QueryUrlSyncOptions) {
  const route = useRoute()
  const router = useRouter()

  const {
    modeRef,
    modeParamName = 'editorType',
    modeValues = ['builder', 'text'],
    timeLength,
    timeRange,
    editorSql,
    builderFormState,
    tableName,
    defaultMode = 'builder',
    defaultTimeLength = 10,
  } = options

  // Update URL query parameters without navigation
  function updateQueryParams() {
    const query = { ...route.query }

    // Update mode (sqlMode/editorType)
    query[modeParamName] = modeRef.value

    // Update time selection
    if (timeRange.value.length === 2) {
      query.timeRange = timeRange.value
      delete query.timeLength
    } else {
      query.timeLength = timeLength.value.toString()
      delete query.timeRange
    }

    // Update table name if provided (only for refs, not computed)
    if (tableName && 'value' in tableName && tableName.value) {
      query.table = tableName.value
    } else if (tableName && !('value' in tableName)) {
      // For computed properties, don't store in URL since they're derived
      delete query.table
    } else {
      delete query.table
    }

    // Update editor SQL if in text mode
    const isTextMode = modeRef.value === 'text'
    if (isTextMode && editorSql.value) {
      query.editorSql = encodeURIComponent(editorSql.value)
    } else {
      delete query.editorSql
    }

    // Update builder form state if available and in builder mode
    if (modeRef.value === 'builder' && builderFormState.value) {
      query.builderForm = encodeURIComponent(JSON.stringify(builderFormState.value))
    } else {
      delete query.builderForm
    }

    // Update URL without triggering navigation
    router.replace({ query })
  }

  // Initialize state from URL query parameters
  function initializeFromQuery() {
    const {
      timeLength: queryTimeLength,
      timeRange: queryTimeRange,
      table: queryTable,
      editorSql: queryEditorSql,
      builderForm: queryBuilderForm,
    } = route.query

    const queryMode = route.query[modeParamName]

    // Initialize mode
    if (queryMode && modeValues.includes(queryMode as string)) {
      modeRef.value = queryMode as string
    } else {
      modeRef.value = defaultMode
    }

    // Initialize time selection
    if (queryTimeLength !== undefined) {
      const length = parseInt(queryTimeLength as string, 10)
      if (!Number.isNaN(length)) {
        timeLength.value = length
      }
    } else {
      timeLength.value = defaultTimeLength
    }

    if (queryTimeRange && Array.isArray(queryTimeRange)) {
      timeRange.value = queryTimeRange as string[]
    }

    // Initialize table name if ref is provided (not for computed)
    if (tableName && 'value' in tableName && !('effect' in tableName) && queryTable) {
      ;(tableName as Ref<string>).value = queryTable as string
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
        console.warn('Failed to parse builder form state from URL:', error)
      }
    }
  }

  return {
    updateQueryParams,
    initializeFromQuery,
  }
}
