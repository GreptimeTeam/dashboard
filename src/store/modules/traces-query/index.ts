import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBaseQueryStore } from '@/store/composables/useBaseQueryStore'

const useTracesQueryStore = defineStore('tracesQuery', () => {
  // Initialize base query store functionality
  const baseStore = useBaseQueryStore({
    storeId: 'tracesQuery',
    defaultEditorType: 'builder',
    defaultTimeLength: 10,
    defaultLimit: 1000,
  })

  // Extract state and methods from base store
  const {
    builderSql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    editorType,
    editorSql,
    builderFormState,
    limit,
    finalQuery,
    unixTimeRange,
    tsColumn,
    reset: baseReset,
    initializeFromQuery,
    updateQueryParams,
    updateBuilderSql,
    executeBaseQuery,
    executeQuery,
    exportToCSV,
    addFilterCondition,
    // Query execution state from base store
    loading,
    columns,
  } = baseStore

  // Note: executeQuery is now provided by the base store

  // Note: reset is now provided by the base store (includes loading, allResults, columns reset)

  return {
    // Base store state and methods
    builderSql,
    currentTableName,
    rangeTime,
    time,
    timeRangeValues,
    editorType,
    editorSql,
    builderFormState,
    limit,
    finalQuery,
    unixTimeRange,
    tsColumn,
    initializeFromQuery,
    updateQueryParams,
    updateBuilderSql,
    executeBaseQuery,
    executeQuery,
    exportToCSV,
    addFilterCondition,

    // Query execution state from base store
    loading,
    columns,

    // Reset function from base store
    reset: baseReset,
  }
})

export default useTracesQueryStore
