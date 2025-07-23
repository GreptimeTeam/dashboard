import { useRoute, useRouter } from 'vue-router'

const useQueryUrlSync = ({ builderFormState, textEditorState, timeRange, editorType, urlParams = {} as any }) => {
  const route = useRoute()
  const router = useRouter()

  function initializeFromQuery() {
    const {
      [urlParams.editorType || 'editorType']: queryEditorType,
      [urlParams.timeLength || 'timeLength']: queryTimeLength,
      [urlParams.timeRange || 'timeRange']: queryTimeRange,
      [urlParams.editorSql || 'editorSql']: queryEditorSql,
      [urlParams.builderForm || 'builderForm']: queryBuilderForm,
    } = route.query

    // Editor type
    if (queryEditorType && ['builder', 'text'].includes(queryEditorType as string)) {
      editorType.value = queryEditorType as 'builder' | 'text'
    }

    // Time selection
    if (queryTimeLength !== undefined) {
      const length = parseInt(queryTimeLength as string, 10)
      if (!Number.isNaN(length)) {
        timeRange.time.value = length
      }
    }
    if (queryTimeRange && Array.isArray(queryTimeRange)) {
      timeRange.rangeTime.value = queryTimeRange as string[]
    }

    // Editor SQL
    if (queryEditorSql) {
      textEditorState.sql = decodeURIComponent(queryEditorSql as string)
    }

    // Builder form state
    if (queryBuilderForm) {
      try {
        Object.assign(builderFormState, JSON.parse(decodeURIComponent(queryBuilderForm as string)))
      } catch (error) {
        console.warn('Failed to parse builder form state from URL:', error)
      }
    }
  }

  function updateQueryParams() {
    const query = { ...route.query }
    // Editor type
    query[urlParams.editorType || 'editorType'] = editorType.value
    // Time selection
    if (timeRange.rangeTime.value.length === 2) {
      query[urlParams.timeRange || 'timeRange'] = timeRange.rangeTime.value
      delete query[urlParams.timeLength || 'timeLength']
    } else {
      query[urlParams.timeLength || 'timeLength'] = timeRange.time.value.toString()
      delete query[urlParams.timeRange || 'timeRange']
    }
    // Editor SQL
    if (editorType.value === 'text' && textEditorState.sql) {
      query[urlParams.editorSql || 'editorSql'] = encodeURIComponent(textEditorState.sql)
    } else {
      delete query[urlParams.editorSql || 'editorSql']
    }
    // Builder form state
    if (editorType.value === 'builder' && builderFormState) {
      query[urlParams.builderForm || 'builderForm'] = encodeURIComponent(JSON.stringify(builderFormState))
    } else {
      delete query[urlParams.builderForm || 'builderForm']
    }
    router.replace({ query })
  }

  return {
    initializeFromQuery,
    updateQueryParams,
  }
}

export default useQueryUrlSync
