export interface IngestConfig {
  type: string
  tabKey: string
  submitLabel: string
  placeholder?: string
  hasDoc?: boolean
  successMessage?: string
  docContent?: string
  params?: any
  submitHandler: (content: string, params?: any, file?: File) => Promise<any>
  [key: string]: any
}

export default function useIngest() {
  const codeRunStore = useCodeRunStore()

  const getInfluxdbInputConfig = (precision: Ref<string>): IngestConfig => ({
    type: 'influxdb',
    tabKey: 'influxdb-input',
    submitLabel: 'Write',
    placeholder: 'cpu_usage,host=server1,region=us-west usage_user=80,usage_system=10 1621401600000000000',
    hasDoc: true,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.writeInfluxDB(content, precision.value)
    },
    get params() {
      return { precision: precision.value }
    },
  })

  const getInfluxdbUploadConfig = (precision: Ref<string>): IngestConfig => ({
    type: 'influxdb',
    tabKey: 'influxdb-upload',
    submitLabel: 'Write',
    hasDoc: true,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.writeInfluxDB(content, precision.value)
    },
    get params() {
      return { precision: precision.value }
    },
  })

  const getLogIngestionInputConfig = (
    pipeline: Ref<string>,
    table: Ref<string>,
    contentType: Ref<string>
  ): IngestConfig => ({
    type: 'log-ingestion',
    tabKey: 'log-ingestion-input',
    submitLabel: 'Write',
    placeholder: `{"message": "hello world", "time": "2024-07-12T16:18:53.048"}
{"message": "hello greptime", "time": "2024-07-12T16:18:53.048"}`,
    hasDoc: false,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.processLogs(content, table.value, pipeline.value, contentType.value)
    },
    get params() {
      return { pipeline: pipeline.value, table: table.value, contentType: contentType.value }
    },
  })

  const getLogIngestionUploadConfig = (
    pipeline: Ref<string>,
    table: Ref<string>,
    contentType: Ref<string>
  ): IngestConfig => ({
    type: 'log-ingestion',
    tabKey: 'log-ingestion-upload',
    submitLabel: 'Write',
    hasDoc: false,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.processLogs(content, table.value, pipeline.value, contentType.value)
    },
    get params() {
      return { pipeline: pipeline.value, table: table.value, contentType: contentType.value }
    },
  })

  return {
    getInfluxdbInputConfig,
    getLogIngestionInputConfig,
    getInfluxdbUploadConfig,
    getLogIngestionUploadConfig,
  }
}
