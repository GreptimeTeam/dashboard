import { ref } from 'vue'
import { defineStore } from 'pinia'

const useIngestStore = defineStore('ingest', () => {
  const activeTab = ref('influxdb-input')
  const precision = ref('ns')
  const footer = ref<{ [key: string]: boolean }>({
    'influxdb-input': true,
    'influxdb-upload': true,
  })

  return {
    activeTab,
    precision,
    footer,
  }
})
export default useIngestStore
