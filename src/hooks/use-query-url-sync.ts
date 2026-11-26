import { nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const useQueryUrlSync = ({ builderFormState, textEditorState, timeRange, editorType, urlParams = {} as any }) => {
  const route = useRoute()
  const router = useRouter()
  /** True while `updateQueryParams` is writing; pages should ignore the echoed route watch. */
  let applyingLocalUrlUpdate = false

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
      timeRange.time.value = 0
    }

    // Editor SQL
    if (queryEditorSql) {
      textEditorState.sql = decodeURIComponent(queryEditorSql as string)
    }

    // Builder form state
    if (queryBuilderForm) {
      try {
        const paramsObj = JSON.parse(decodeURIComponent(queryBuilderForm as string))
        delete paramsObj.tsColumn
        Object.assign(builderFormState, paramsObj)
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
    applyingLocalUrlUpdate = true
    Promise.resolve(router.replace({ query })).finally(() => {
      nextTick(() => {
        applyingLocalUrlUpdate = false
      })
    })
  }

  /** Skip route watches that only echo our own `updateQueryParams` write. */
  function isApplyingLocalUrlUpdate() {
    return applyingLocalUrlUpdate
  }

  return {
    initializeFromQuery,
    updateQueryParams,
    isApplyingLocalUrlUpdate,
  }
}

export default useQueryUrlSync
