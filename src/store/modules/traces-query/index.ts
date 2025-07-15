import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBaseQueryStore } from '@/store/composables/useBaseQueryStore'

const useTracesQueryStore = defineStore('tracesQuery', () => {
  // Initialize base query store functionality
  const baseStore = useBaseQueryStore({
    storeId: 'tracesQuery',
    editorType: 'builder',
    time: 10,
    limit: 1000,
  })

  return {
    // Base store state and methods
    ...baseStore,
  }
})

export default useTracesQueryStore
