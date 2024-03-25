import { ref } from 'vue'
import { defineStore } from 'pinia'

const useIngestStore = defineStore('ingest', () => {
  const activeTab = ref('influxdb-input')

  return {
    activeTab,
  }
})
export default useIngestStore
