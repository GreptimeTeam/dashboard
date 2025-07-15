import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBaseQueryStore } from '@/store/composables/useBaseQueryStore'

const useLogsQueryStore = defineStore('logsQuery', () => {
  // Initialize base query store functionality
  const baseStore = useBaseQueryStore({
    storeId: 'logsQuery',
    editorType: 'builder',
    time: 10,
    limit: 1000,
  })

  // Logs-specific state
  const refresh = ref(false)

  // Extract state and methods from base store
  const { reset: baseReset } = baseStore

  // Logs-specific reset function that includes base reset
  function reset() {
    baseReset()
    refresh.value = false
  }

  return {
    // Base store state and methods
    ...baseStore,
    refresh,
    reset,
  }
})

export default useLogsQueryStore
