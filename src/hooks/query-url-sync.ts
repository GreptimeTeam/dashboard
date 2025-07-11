import { ref, Ref, ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface QueryUrlSyncOptions {
  editorType: Ref<string>
  // Time configuration
  timeLength: Ref<number>
  timeRange: Ref<string[]>

  // SQL and form state
  editorSql: Ref<string>
  builderFormState: Ref<any>
}

export default function useQueryUrlSync(options: QueryUrlSyncOptions) {
  const route = useRoute()
  const router = useRouter()

  const { timeLength = ref(10), timeRange, editorSql, builderFormState, editorType = ref('builder') } = options

  // Update URL query parameters without navigation
  function updateQueryParams() {
    const query = { ...route.query }

    // Update time selection
    if (timeRange.value.length === 2) {
      query.timeRange = timeRange.value
      delete query.timeLength
    } else {
      query.timeLength = timeLength.value.toString()
      delete query.timeRange
    }

    // Update editor SQL if in text mode
    const isTextMode = editorType.value === 'text'
    if (isTextMode && editorSql.value) {
      query.editorSql = encodeURIComponent(editorSql.value)
    } else {
      delete query.editorSql
    }

    // Update builder form state if available and in builder mode
    if (editorType.value === 'builder' && builderFormState.value) {
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
      editorSql: queryEditorSql,
      builderForm: queryBuilderForm,
    } = route.query

    editorType.value = route.query.editorType as string

    // Initialize time selection
    if (queryTimeLength !== undefined) {
      const length = parseInt(queryTimeLength as string, 10)
      if (!Number.isNaN(length)) {
        timeLength.value = length
      }
    }

    if (queryTimeRange && Array.isArray(queryTimeRange)) {
      timeRange.value = queryTimeRange as string[]
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
    editorType,
    timeLength,
    timeRange,
    editorSql,
    builderFormState,
  }
}
