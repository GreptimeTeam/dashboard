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

  const getLogIngestionInputConfig = (pipeline: Ref<string>, table: Ref<string>): IngestConfig => ({
    type: 'log-ingestion',
    tabKey: 'log-ingestion-input',
    submitLabel: 'Write',
    placeholder: `{"name": "Alice", "age": 20, "is_student": true, "score": 90.5,"object": {"a":1,"b":2}},
{"age": 21, "is_student": false, "score": 85.5, "company": "A" ,"whatever": null},
{"name": "Charlie", "age": 22, "is_student": true, "score": 95.5,"array":[1,2,3]}
`,
    hasDoc: false,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.processLogs(content, table.value, pipeline.value)
    },
    get params() {
      return { pipeline: pipeline.value, table: table.value }
    },
  })

  const getLogIngestionUploadConfig = (pipeline: Ref<string>, table: Ref<string>): IngestConfig => ({
    type: 'log-ingestion',
    tabKey: 'log-ingestion-upload',
    submitLabel: 'Write',
    hasDoc: false,
    successMessage: 'Data written successfully',
    submitHandler: async (content: string) => {
      return codeRunStore.processLogs(content, table.value, pipeline.value)
    },
    get params() {
      return { pipeline: pipeline.value, table: table.value }
    },
  })

  return {
    getInfluxdbInputConfig,
    getLogIngestionInputConfig,
    getInfluxdbUploadConfig,
    getLogIngestionUploadConfig,
  }
}
