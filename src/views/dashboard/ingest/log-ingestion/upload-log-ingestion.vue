<template lang="pug">
BaseUpload(:config="config")
  template(#selector)
    a-space(:size="15")
      .select-item
        span.label Table
        a-select(
          v-model="tableForPipeline"
          size="small"
          allow-search
          :options="tableOptions"
          :loading="tableLoading"
          :style="{ minWidth: '140px' }"
          :trigger-props="{ autoFitPopupMinWidth: true }"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="small"
          allow-search
          :options="pipelineOptions"
          :loading="pipelineLoading"
          :style="{ minWidth: '140px' }"
          :trigger-props="{ autoFitPopupMinWidth: true }"
        )
      .select-item
        span.label Format
        a-select(v-model="contentType" size="small" :style="{ width: '110px' }")
          a-option(value="text/plain") text
          a-option(value="application/json") json
          a-option(value="application/x-ndjson") ndjson

  template(#modal-selector)
    a-space(:size="15")
      .select-item
        span.label Table
        a-select(
          v-model="tableForPipeline"
          size="small"
          allow-search
          :options="tableOptions"
          :loading="tableLoading"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="small"
          allow-search
          :options="pipelineOptions"
          :loading="pipelineLoading"
        )
      .select-item
        span.label Format
        a-select(v-model="contentType" size="small")
          a-option(value="text/plain") Plain Text
          a-option(value="application/json") JSON
          a-option(value="application/x-ndjson") NDJSON
</template>

<script lang="ts" setup>
  const ingestStore = useIngestStore()
  const dataBaseStore = useDataBaseStore()

  const { pipelineName, tableForPipeline, contentType, pipelineOptions, pipelineLoading } = storeToRefs(ingestStore)

  const tableOptions = computed(() => {
    return dataBaseStore.originTablesTree.map((table) => ({
      label: table.title,
      value: table.title,
    }))
  })

  const tableLoading = computed(() => dataBaseStore.tablesLoading)

  onActivated(async () => {
    await dataBaseStore.checkTables()
    await ingestStore.fetchPipelines()
    if (tableOptions.value.length > 0 && !tableForPipeline.value) {
      tableForPipeline.value = tableOptions.value[0].value
    }

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
