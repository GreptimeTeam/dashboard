import { ref } from 'vue'
import { defineStore } from 'pinia'

const useIngestStore = defineStore('ingest', () => {
  const activeTab = ref('influxdb-input')
  const precision = ref('ns')

  return {
    activeTab,
    precision,
  }
})
export default useIngestStore
