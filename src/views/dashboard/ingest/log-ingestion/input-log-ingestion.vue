<template lang="pug">
BaseInput(:config="config")
  template(#selector="{ config }")
    a-space(:size="15")
      .select-item
        span.label Table
        TableSelect(
          v-model="tableForPipeline"
          size="medium"
          allow-create
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
</template>

<script lang="ts" setup>
  import TableSelect from '@/components/table-select/index.vue'

  import { useAppStore } from '@/store'

  const ingestStore = useIngestStore()
  const { database } = storeToRefs(useAppStore())
  const route = useRoute()
  const { pipelineName, tableForPipeline, contentType, pipelineOptions, pipelineLoading } = storeToRefs(ingestStore)

  onActivated(async () => {
    if (route.query.pipeline) {
      pipelineName.value = route.query.pipeline as string
    }
    await ingestStore.fetchPipelines()

    if (pipelineOptions.value.length > 0 && !pipelineName.value) {
      pipelineName.value = pipelineOptions.value[0].value
    }
  })

  const { getLogIngestionInputConfig } = useIngest()
  const config = getLogIngestionInputConfig(pipelineName, tableForPipeline, contentType)
</script>

<style lang="less" scoped>
  .select-item {
    display: flex;
    align-items: center;

    .label {
      margin-right: 6px;
      white-space: nowrap;
    }
  }
</style>
