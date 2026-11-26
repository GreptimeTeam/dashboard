<template lang="pug">
BaseUpload(:config="config")
  template(#selector)
    a-space(:size="15")
      .select-item
        span.label Table
        TableSelect(
          v-model="tableForPipeline"
          size="medium"
          :database="database"
          :style="{ minWidth: '140px' }"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="medium"
          allow-search
          :options="pipelineOptions"
          :loading="pipelineLoading"
          :style="{ minWidth: '140px' }"
          :trigger-props="{ autoFitPopupMinWidth: true }"
        )
      .select-item
        span.label Format
        a-select(v-model="contentType" size="medium" :style="{ width: '110px' }")
          a-option(value="text/plain") Plain Text
          a-option(value="application/json") JSON
          a-option(value="application/x-ndjson") NDJSON

  template(#modal-selector)
    a-space(:size="15")
      .select-item
        span.label Table
        TableSelect(
          v-model="tableForPipeline"
          size="medium"
          allow-create
          :database="database"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="medium"
          allow-search
          :options="pipelineOptions"
          :loading="pipelineLoading"
        )
      .select-item
        span.label Format
        a-select(v-model="contentType" size="medium")
          a-option(value="text/plain") Plain Text
          a-option(value="application/json") JSON
          a-option(value="application/x-ndjson") NDJSON
</template>

<script lang="ts" setup>
  import TableSelect from '@/components/table-select/index.vue'

  import { useAppStore } from '@/store'

  const ingestStore = useIngestStore()
  const { database } = storeToRefs(useAppStore())

  const { pipelineName, tableForPipeline, contentType, pipelineOptions, pipelineLoading } = storeToRefs(ingestStore)

  onActivated(async () => {
    await ingestStore.fetchPipelines()

    if (pipelineOptions.value.length > 0 && !pipelineName.value) {
      pipelineName.value = pipelineOptions.value[0].value
    }
  })

  const { getLogIngestionUploadConfig } = useIngest()
  const config = getLogIngestionUploadConfig(pipelineName, tableForPipeline, contentType)
</script>

<style lang="less" scoped>
  .select-item {
    display: flex;
    align-items: center;

    .label {
      margin-right: 6px;
      white-space: nowrap;
      font-size: 12px;
    }
  }
</style>
