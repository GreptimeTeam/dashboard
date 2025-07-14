import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBaseQueryStore } from '@/store/composables/useBaseQueryStore'

const useLogsQueryStore = defineStore('logsQuery', () => {
  // Initialize base query store functionality
  const baseStore = useBaseQueryStore({
    storeId: 'logsQuery',
    defaultEditorType: 'builder',
    defaultTimeLength: 10,
    defaultLimit: 1000,
  })

  // Logs-specific state
  const refresh = ref(false)

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

  // Logs-specific reset function that includes base reset
  function reset() {
    baseReset()
    refresh.value = false
  }

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
    refresh,
    // Reset function from base store
    reset,
  }
})

export default useLogsQueryStore
