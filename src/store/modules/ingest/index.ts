import { list as listPipelines } from '@/api/pipeline'

const useIngestStore = defineStore('ingest', () => {
  const activeTab = ref('influxdb-input')
  const precision = ref('ns')
  const pipelineName = ref('')
  const tableForPipeline = ref('')
  const contentType = ref('application/x-ndjson')
  const pipelineList = ref([])
  const pipelineLoading = ref(false)

  const footer = ref<{ [key: string]: boolean }>({
    'influxdb-input': true,
    'influxdb-upload': true,
    'log-ingestion-input': true,
    'log-ingestion-upload': true,
  })

  const pipelineOptions = computed(() => {
    return pipelineList.value.map((pipeline) => ({
      label: pipeline.name,
      value: pipeline.name,
    }))
  })

  const fetchPipelines = async () => {
    pipelineLoading.value = true
    try {
      pipelineList.value = await listPipelines()
    } catch (error) {
      console.error('Failed to fetch pipelines:', error)
      pipelineList.value = []
    } finally {
      pipelineLoading.value = false
    }
  }

  return {
    activeTab,
    precision,
    footer,
    pipelineName,
    tableForPipeline,
    contentType,
    pipelineList,
    pipelineLoading,
    pipelineOptions,
    fetchPipelines,
  }
})

export default useIngestStore
